const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { z } = require("zod");

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ASGARDEO_ENABLED = String(process.env.ASGARDEO_ENABLED || "true").toLowerCase() === "true";
const ASGARDEO_ISSUER_URL = process.env.ASGARDEO_ISSUER_URL || "";
const ASGARDEO_AUDIENCE = process.env.ASGARDEO_AUDIENCE || "";
const ASGARDEO_JWKS_URL = process.env.ASGARDEO_JWKS_URL || "";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query("SELECT NOW()").then((r) => {
  console.log("✅ Database connected:", r.rows[0].now);
}).catch((e) => {
  console.error("❌ Database connection failed:", e.message);
});

const app = express();
const invalidatedTokens = new Set();

const splitOrigins = FRONTEND_ORIGIN.split(",").map((v) => v.trim()).filter(Boolean);
app.use(cors({ origin: splitOrigins.length ? splitOrigins : ["http://localhost:5173"], credentials: true }));
app.use(express.json({ limit: "1mb" }));

const nowIso = () => new Date().toISOString();
const nextId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const nextAccountNumber = () => String(Date.now()).slice(-10);
const maskAccountNumber = (value) => `******${String(value).slice(-4)}`;
const canPost = (status) => status === "active";

const mapTransaction = (t) => ({
  id: t.id,
  accountId: t.account_id,
  type: t.type,
  amount: Number(t.amount),
  balanceAfter: Number(t.balance_after),
  memo: t.memo,
  postedBy: t.posted_by,
  createdAt: t.created_at,
  transferRef: t.transfer_ref,
});

const mapAccount = (a) => ({
  id: a.id,
  customerId: a.customer_id,
  accountNumber: a.account_number,
  maskedAccountNumber: maskAccountNumber(a.account_number),
  routingNumber: a.routing_number,
  type: a.type,
  status: a.status,
  balance: Number(a.balance),
  apy: Number(a.apy),
  overdraftLimit: Number(a.overdraft_limit),
  closedAt: a.closed_at,
});

const isAsgardeoConfigured = () =>
  ASGARDEO_ENABLED && Boolean(ASGARDEO_ISSUER_URL) && Boolean(ASGARDEO_AUDIENCE);

const normalizeRole = (payload) => {
  const candidates = [];
  if (typeof payload.role === "string") candidates.push(payload.role);
  if (Array.isArray(payload.roles)) candidates.push(...payload.roles);
  if (Array.isArray(payload.groups)) candidates.push(...payload.groups);

  const wso2Roles = payload["http://wso2.org/claims/role"];
  if (typeof wso2Roles === "string") candidates.push(...wso2Roles.split(","));
  if (Array.isArray(wso2Roles)) candidates.push(...wso2Roles);

  for (const item of candidates) {
    const value = String(item || "").toLowerCase();
    if (value.includes("admin")) return "admin";
    if (value.includes("teller")) return "teller";
    if (value.includes("auditor")) return "auditor";
    if (value.includes("customer")) return "customer";
  }

  const email = String(payload.email || payload.preferred_username || payload.username || payload.sub || "").toLowerCase();
  if (email.includes("admin")) return "admin";
  if (email.includes("teller")) return "teller";
  if (email.includes("auditor")) return "auditor";
  if (email.includes("customer")) return "customer";

  // ⚠️ Temporary default until Asgardeo role claims are configured
  return "admin";
};

const toPrincipal = (payload) => {
  const email = payload.email || payload.username || payload.preferred_username ||
    payload["http://wso2.org/claims/emailaddress"] || "";
  const userId = payload.userId || payload.sub || email || "external-user";
  return {
    userId: String(userId),
    role: normalizeRole(payload),
    email: String(email || ""),
    sub: String(payload.sub || ""),
    claims: payload,
  };
};

let remoteJwks;
const verifyAsgardeoToken = async (token) => {
  const { createRemoteJWKSet, jwtVerify } = await import("jose");
  if (!remoteJwks) {
    const fallbackJwks = `${ASGARDEO_ISSUER_URL.replace(/\/$/, "")}/oauth2/jwks`;
    remoteJwks = createRemoteJWKSet(new URL(ASGARDEO_JWKS_URL || fallbackJwks));
  }
  const { payload } = await jwtVerify(token, remoteJwks, {
    issuer: ASGARDEO_ISSUER_URL,
    audience: ASGARDEO_AUDIENCE,
  });
  return toPrincipal(payload);
};

const verifyLocalToken = async (token) => {
  const payload = jwt.verify(token, JWT_SECRET);
  return toPrincipal(payload);
};

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid token" });
    }
    const token = authHeader.slice("Bearer ".length);
    if (invalidatedTokens.has(token)) {
      return res.status(401).json({ error: "Token is invalidated" });
    }
    req.authToken = token;
    req.auth = isAsgardeoConfigured()
      ? await verifyAsgardeoToken(token)
      : await verifyLocalToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: "Missing or invalid token" });
  }
};

const allowRoles = (roles) => (req, res, next) => {
  if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
  if (!req.auth.role || !roles.includes(req.auth.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
};

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "bank-admin-backend" });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  if (isAsgardeoConfigured()) {
    return res.status(400).json({ error: "Direct login disabled. Use Asgardeo sign-in." });
  }
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { email, password } = parsed.data;
  const { rows } = await pool.query("SELECT * FROM staff_users WHERE LOWER(email) = LOWER($1)", [email]);
  const user = rows[0];
  const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
  const success = Boolean(user && user.is_active && passwordOk);

  await pool.query(
    "INSERT INTO login_audits (email, ip, success) VALUES ($1,$2,$3)",
    [email, req.ip || "unknown", success]
  );

  if (!success || !user) return res.status(401).json({ error: "Invalid credentials" });

  const accessToken = jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({
    accessToken,
    user: { id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email, role: user.role, isActive: user.is_active },
  });
});

app.post("/api/auth/logout", authenticate, (req, res) => {
  if (req.authToken) invalidatedTokens.add(req.authToken);
  return res.json({ ok: true });
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  const email = String(req.auth.email || req.headers["x-user-email"] || "").toLowerCase();
  const sub = req.auth.sub;

  // Check staff users first
  const { rows: staffRows } = await pool.query("SELECT * FROM staff_users WHERE LOWER(email) = LOWER($1)", [email]);
  if (staffRows[0]) {
    return res.json({
      id: staffRows[0].id,
      firstName: staffRows[0].first_name,
      lastName: staffRows[0].last_name,
      email: staffRows[0].email,
      role: staffRows[0].role,
      isActive: staffRows[0].is_active,
      authProvider: "asgardeo",
    });
  }

  // Check customers by sub or email
  const { rows: custRows } = await pool.query(
    "SELECT * FROM customers WHERE asgardeo_sub = $1 OR LOWER(email) = LOWER($2)",
    [sub, email]
  );

  if (custRows[0]) {
    const c = custRows[0];
    // Auto-link asgardeo_sub if not set yet
    if (!c.asgardeo_sub && sub) {
      await pool.query("UPDATE customers SET asgardeo_sub = $1 WHERE id = $2", [sub, c.id]);
    }
    return res.json({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      role: "customer",
      isActive: c.is_active,
      authProvider: "asgardeo",
    });
  }

  // Fallback for unrecognized users
  const headerEmail = String(req.headers["x-user-email"] || "").toLowerCase();
  let role = req.auth.role || "auditor";
  if (headerEmail.includes("admin")) role = "admin";
  else if (headerEmail.includes("teller")) role = "teller";
  else if (headerEmail.includes("auditor")) role = "auditor";
  else if (headerEmail.includes("customer")) role = "customer";

  return res.json({
    id: req.auth.userId,
    firstName: headerEmail.split("@")[0] || "External",
    lastName: "User",
    email: headerEmail || email,
    role,
    isActive: true,
    authProvider: "asgardeo",
  });
});

// ─── Customer Self-Service (/me) ──────────────────────────────────────────────
// Note: no allowRoles check — security is enforced by asgardeo_sub lookup.
// If no matching customer record exists, the route returns 404.

app.get("/api/me/profile", authenticate, async (req, res) => {
  const sub = req.auth.sub;
  const email = String(req.auth.email || req.headers["x-user-email"] || "").toLowerCase();

  const { rows } = await pool.query(
    "SELECT * FROM customers WHERE asgardeo_sub = $1 OR LOWER(email) = LOWER($2)",
    [sub, email]
  );
  if (!rows[0]) return res.status(404).json({ error: "Customer profile not found" });
  const c = rows[0];
  return res.json({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    isActive: c.is_active,
  });
});

app.get("/api/me/accounts", authenticate, async (req, res) => {
  const sub = req.auth.sub;
  const email = String(req.auth.email || req.headers["x-user-email"] || "").toLowerCase();

  const { rows: custRows } = await pool.query(
    "SELECT id FROM customers WHERE asgardeo_sub = $1 OR LOWER(email) = LOWER($2)",
    [sub, email]
  );
  if (!custRows[0]) return res.status(404).json({ error: "Customer not found" });

  const { rows } = await pool.query("SELECT * FROM accounts WHERE customer_id = $1", [custRows[0].id]);
  return res.json(rows.map(mapAccount));
});

app.get("/api/me/transactions", authenticate, async (req, res) => {
  const sub = req.auth.sub;
  const email = String(req.auth.email || req.headers["x-user-email"] || "").toLowerCase();

  const { rows: custRows } = await pool.query(
    "SELECT id FROM customers WHERE asgardeo_sub = $1 OR LOWER(email) = LOWER($2)",
    [sub, email]
  );
  if (!custRows[0]) return res.status(404).json({ error: "Customer not found" });

  const { rows: acctRows } = await pool.query("SELECT id FROM accounts WHERE customer_id = $1", [custRows[0].id]);
  if (acctRows.length === 0) return res.json([]);

  const accountIds = acctRows.map((a) => a.id);
  const { rows } = await pool.query(
    "SELECT * FROM transactions WHERE account_id = ANY($1) ORDER BY created_at DESC",
    [accountIds]
  );
  return res.json(rows.map(mapTransaction));
});

// ─── Staff Users ──────────────────────────────────────────────────────────────

app.get("/api/users", authenticate, allowRoles(["admin"]), async (_req, res) => {
  const { rows } = await pool.query("SELECT id, first_name, last_name, email, role, is_active FROM staff_users");
  return res.json(rows.map((u) => ({ id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, role: u.role, isActive: u.is_active })));
});

app.post("/api/users", authenticate, allowRoles(["admin"]), async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    role: z.enum(["admin", "teller", "auditor"]),
    password: z.string().min(8).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows: existing } = await pool.query("SELECT id FROM staff_users WHERE LOWER(email) = LOWER($1)", [parsed.data.email]);
  if (existing.length > 0) return res.status(409).json({ error: "Email already exists" });

  const passwordHash = await bcrypt.hash(parsed.data.password || "TempPass123!", 12);
  const id = nextId("user");
  await pool.query(
    "INSERT INTO staff_users (id, first_name, last_name, email, role, password_hash, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, parsed.data.firstName, parsed.data.lastName, parsed.data.email, parsed.data.role, passwordHash, true]
  );
  return res.status(201).json({ id, firstName: parsed.data.firstName, lastName: parsed.data.lastName, email: parsed.data.email, role: parsed.data.role, isActive: true });
});

app.get("/api/users/:id", authenticate, allowRoles(["admin"]), async (req, res) => {
  const { rows } = await pool.query("SELECT id, first_name, last_name, email, role, is_active FROM staff_users WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  const u = rows[0];
  return res.json({ id: u.id, firstName: u.first_name, lastName: u.last_name, email: u.email, role: u.role, isActive: u.is_active });
});

app.put("/api/users/:id", authenticate, allowRoles(["admin"]), async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    role: z.enum(["admin", "teller", "auditor"]).optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows } = await pool.query("SELECT * FROM staff_users WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  const u = rows[0];

  const firstName = parsed.data.firstName ?? u.first_name;
  const lastName = parsed.data.lastName ?? u.last_name;
  const role = parsed.data.role ?? u.role;
  const isActive = parsed.data.isActive ?? u.is_active;

  await pool.query(
    "UPDATE staff_users SET first_name=$1, last_name=$2, role=$3, is_active=$4 WHERE id=$5",
    [firstName, lastName, role, isActive, req.params.id]
  );
  return res.json({ id: u.id, firstName, lastName, email: u.email, role, isActive });
});

app.delete("/api/users/:id", authenticate, allowRoles(["admin"]), async (req, res) => {
  const { rows } = await pool.query("SELECT id FROM staff_users WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  await pool.query("UPDATE staff_users SET is_active = false WHERE id = $1", [req.params.id]);
  return res.json({ ok: true });
});

// ─── Customers ────────────────────────────────────────────────────────────────

app.get("/api/customers", authenticate, allowRoles(["admin", "teller", "auditor"]), async (req, res) => {
  const search = String(req.query.search || "").toLowerCase();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 50);
  const offset = (page - 1) * pageSize;

  const params = [];
  let where = "";
  if (search) {
    params.push(`%${search}%`);
    where = "WHERE LOWER(first_name) LIKE $1 OR LOWER(last_name) LIKE $1 OR LOWER(email) LIKE $1";
  }

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(`SELECT * FROM customers ${where} ORDER BY created_at LIMIT ${pageSize} OFFSET ${offset}`, params),
    pool.query(`SELECT COUNT(*) FROM customers ${where}`, params),
  ]);

  const items = rows.map((c) => ({ id: c.id, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone, dateOfBirth: c.date_of_birth, address: c.address, isActive: c.is_active }));
  return res.json({ items, page, pageSize, total: Number(countRows[0].count) });
});

app.post("/api/customers", authenticate, allowRoles(["admin"]), async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(7),
    dateOfBirth: z.string().min(4),
    address: z.string().min(5),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const id = nextId("cust");
  await pool.query(
    "INSERT INTO customers (id, first_name, last_name, email, phone, date_of_birth, address, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, parsed.data.firstName, parsed.data.lastName, parsed.data.email, parsed.data.phone, parsed.data.dateOfBirth, parsed.data.address, true]
  );
  return res.status(201).json({ id, ...parsed.data, isActive: true });
});

app.get("/api/customers/:id", authenticate, allowRoles(["admin", "teller", "auditor"]), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Customer not found" });
  const c = rows[0];
  const { rows: acctRows } = await pool.query("SELECT * FROM accounts WHERE customer_id = $1", [c.id]);
  return res.json({ id: c.id, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone, dateOfBirth: c.date_of_birth, address: c.address, isActive: c.is_active, accounts: acctRows.map(mapAccount) });
});

app.put("/api/customers/:id", authenticate, allowRoles(["admin"]), async (req, res) => {
  const schema = z.object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    address: z.string().min(5).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Customer not found" });
  const c = rows[0];

  const email = parsed.data.email ?? c.email;
  const phone = parsed.data.phone ?? c.phone;
  const address = parsed.data.address ?? c.address;

  await pool.query("UPDATE customers SET email=$1, phone=$2, address=$3 WHERE id=$4", [email, phone, address, req.params.id]);
  return res.json({ id: c.id, firstName: c.first_name, lastName: c.last_name, email, phone, dateOfBirth: c.date_of_birth, address, isActive: c.is_active });
});

app.delete("/api/customers/:id", authenticate, allowRoles(["admin"]), async (req, res) => {
  const { rows } = await pool.query("SELECT id FROM customers WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Customer not found" });
  await pool.query("UPDATE customers SET is_active = false WHERE id = $1", [req.params.id]);
  await pool.query("UPDATE accounts SET status = 'frozen' WHERE customer_id = $1 AND status != 'closed'", [req.params.id]);
  return res.json({ ok: true });
});

app.get("/api/customers/:id/accounts", authenticate, allowRoles(["admin", "teller", "auditor"]), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM accounts WHERE customer_id = $1", [req.params.id]);
  return res.json(rows.map(mapAccount));
});

// ─── Accounts ─────────────────────────────────────────────────────────────────

app.get("/api/accounts", authenticate, allowRoles(["admin", "teller", "auditor"]), async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM accounts");
  return res.json(rows.map(mapAccount));
});

app.post("/api/accounts", authenticate, allowRoles(["admin"]), async (req, res) => {
  const schema = z.object({
    customerId: z.string().min(1),
    type: z.enum(["checking", "savings"]),
    apy: z.number().optional(),
    overdraftLimit: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows: custRows } = await pool.query("SELECT id FROM customers WHERE id = $1 AND is_active = true", [parsed.data.customerId]);
  if (!custRows[0]) return res.status(404).json({ error: "Active customer not found" });

  const id = nextId("acct");
  const accountNumber = nextAccountNumber();
  const apy = parsed.data.type === "savings" ? parsed.data.apy ?? 1.0 : 0;
  const overdraftLimit = parsed.data.type === "checking" ? parsed.data.overdraftLimit ?? -250 : 0;

  await pool.query(
    "INSERT INTO accounts (id, customer_id, account_number, routing_number, type, status, balance, apy, overdraft_limit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, parsed.data.customerId, accountNumber, "021000021", parsed.data.type, "active", 0, apy, overdraftLimit]
  );

  return res.status(201).json({ id, customerId: parsed.data.customerId, accountNumber, routingNumber: "021000021", type: parsed.data.type, status: "active", balance: 0, apy, overdraftLimit });
});

// NOTE: Must be before /api/accounts/:id to avoid route shadowing
app.get("/api/accounts/transactions", authenticate, allowRoles(["admin", "teller", "auditor"]), async (req, res) => {
  const accountId = String(req.query.accountId || "");
  const { rows } = accountId
    ? await pool.query("SELECT * FROM transactions WHERE account_id = $1 ORDER BY created_at DESC", [accountId])
    : await pool.query("SELECT * FROM transactions ORDER BY created_at DESC");
  return res.json(rows.map(mapTransaction));
});

app.get("/api/accounts/:id", authenticate, allowRoles(["admin", "teller", "auditor"]), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Account not found" });
  return res.json(mapAccount(rows[0]));
});

app.put("/api/accounts/:id", authenticate, allowRoles(["admin"]), async (req, res) => {
  const schema = z.object({
    status: z.enum(["active", "frozen", "closed"]).optional(),
    apy: z.number().optional(),
    overdraftLimit: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Account not found" });
  const a = rows[0];

  let status = a.status;
  let closedAt = a.closed_at;

  if (parsed.data.status === "closed") {
    status = "closed";
    closedAt = nowIso();
  } else if (parsed.data.status) {
    if (a.status === "closed") return res.status(400).json({ error: "Closed accounts cannot be reopened" });
    status = parsed.data.status;
  }

  const apy = a.type === "savings" && parsed.data.apy !== undefined ? parsed.data.apy : a.apy;
  const overdraftLimit = a.type === "checking" && parsed.data.overdraftLimit !== undefined ? parsed.data.overdraftLimit : a.overdraft_limit;

  await pool.query(
    "UPDATE accounts SET status=$1, closed_at=$2, apy=$3, overdraft_limit=$4 WHERE id=$5",
    [status, closedAt, apy, overdraftLimit, req.params.id]
  );

  return res.json(mapAccount({ ...a, status, closed_at: closedAt, apy, overdraft_limit: overdraftLimit }));
});

// ─── Transactions ─────────────────────────────────────────────────────────────

app.get("/api/transactions", authenticate, allowRoles(["admin", "teller", "auditor"]), async (req, res) => {
  const accountId = String(req.query.accountId || "");
  const type = String(req.query.type || "");
  const startDate = String(req.query.startDate || "");
  const endDate = String(req.query.endDate || "");
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 50);
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];

  if (accountId) { params.push(accountId); conditions.push(`account_id = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
  if (startDate) { params.push(startDate); conditions.push(`created_at >= $${params.length}`); }
  if (endDate) { params.push(endDate); conditions.push(`created_at <= $${params.length}`); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(`SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
    pool.query(`SELECT COUNT(*) FROM transactions ${where}`, params),
  ]);

  return res.json({ items: rows.map(mapTransaction), page, pageSize, total: Number(countRows[0].count) });
});

app.get("/api/transactions/:id", authenticate, allowRoles(["admin", "teller", "auditor"]), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM transactions WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Transaction not found" });
  return res.json(mapTransaction(rows[0]));
});

const amountSchema = z.object({ accountId: z.string().min(1), amount: z.number().gt(0), memo: z.string().optional() });

app.post("/api/transactions/deposit", authenticate, allowRoles(["admin", "teller"]), async (req, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [parsed.data.accountId]);
  if (!rows[0]) return res.status(404).json({ error: "Account not found" });
  if (!canPost(rows[0].status)) return res.status(400).json({ error: "Transactions are blocked for this account status" });

  const newBalance = Number((Number(rows[0].balance) + parsed.data.amount).toFixed(2));
  await pool.query("UPDATE accounts SET balance = $1 WHERE id = $2", [newBalance, parsed.data.accountId]);

  const id = nextId("txn");
  await pool.query(
    "INSERT INTO transactions (id, account_id, type, amount, balance_after, memo, posted_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, parsed.data.accountId, "deposit", parsed.data.amount, newBalance, parsed.data.memo || null, req.auth.userId]
  );

  return res.status(201).json({ id, accountId: parsed.data.accountId, type: "deposit", amount: parsed.data.amount, balanceAfter: newBalance, memo: parsed.data.memo, postedBy: req.auth.userId, createdAt: nowIso() });
});

app.post("/api/transactions/withdrawal", authenticate, allowRoles(["admin", "teller"]), async (req, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [parsed.data.accountId]);
  if (!rows[0]) return res.status(404).json({ error: "Account not found" });
  if (!canPost(rows[0].status)) return res.status(400).json({ error: "Transactions are blocked for this account status" });

  const newBalance = Number((Number(rows[0].balance) - parsed.data.amount).toFixed(2));
  if (newBalance < Number(rows[0].overdraft_limit)) {
    return res.status(400).json({ error: "Withdrawal exceeds overdraft limit" });
  }

  await pool.query("UPDATE accounts SET balance = $1 WHERE id = $2", [newBalance, parsed.data.accountId]);

  const id = nextId("txn");
  await pool.query(
    "INSERT INTO transactions (id, account_id, type, amount, balance_after, memo, posted_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, parsed.data.accountId, "withdrawal", parsed.data.amount, newBalance, parsed.data.memo || null, req.auth.userId]
  );

  return res.status(201).json({ id, accountId: parsed.data.accountId, type: "withdrawal", amount: parsed.data.amount, balanceAfter: newBalance, memo: parsed.data.memo, postedBy: req.auth.userId, createdAt: nowIso() });
});

app.post("/api/transactions/transfer", authenticate, allowRoles(["admin", "teller"]), async (req, res) => {
  const schema = z.object({
    sourceAccountId: z.string().min(1),
    destinationAccountId: z.string().min(1),
    amount: z.number().gt(0),
    memo: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const { rows: srcRows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [parsed.data.sourceAccountId]);
  const { rows: dstRows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [parsed.data.destinationAccountId]);

  if (!srcRows[0] || !dstRows[0]) return res.status(404).json({ error: "Source or destination account not found" });
  if (!canPost(srcRows[0].status) || !canPost(dstRows[0].status)) {
    return res.status(400).json({ error: "Transactions are blocked for one of the accounts" });
  }

  const srcNewBalance = Number((Number(srcRows[0].balance) - parsed.data.amount).toFixed(2));
  const dstNewBalance = Number((Number(dstRows[0].balance) + parsed.data.amount).toFixed(2));

  if (srcNewBalance < Number(srcRows[0].overdraft_limit)) {
    return res.status(400).json({ error: "Transfer exceeds source overdraft limit" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [srcNewBalance, parsed.data.sourceAccountId]);
    await client.query("UPDATE accounts SET balance = $1 WHERE id = $2", [dstNewBalance, parsed.data.destinationAccountId]);

    const transferRef = nextId("xfer");
    const outId = nextId("txn");
    const inId = nextId("txn");
    const now = nowIso();

    await client.query(
      "INSERT INTO transactions (id, account_id, type, amount, balance_after, memo, posted_by, transfer_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [outId, parsed.data.sourceAccountId, "transfer_out", parsed.data.amount, srcNewBalance, parsed.data.memo || null, req.auth.userId, transferRef]
    );
    await client.query(
      "INSERT INTO transactions (id, account_id, type, amount, balance_after, memo, posted_by, transfer_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [inId, parsed.data.destinationAccountId, "transfer_in", parsed.data.amount, dstNewBalance, parsed.data.memo || null, req.auth.userId, transferRef]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      transferRef,
      transferOut: { id: outId, accountId: parsed.data.sourceAccountId, type: "transfer_out", amount: parsed.data.amount, balanceAfter: srcNewBalance, createdAt: now },
      transferIn: { id: inId, accountId: parsed.data.destinationAccountId, type: "transfer_in", amount: parsed.data.amount, balanceAfter: dstNewBalance, createdAt: now },
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Transfer failed and was rolled back" });
  } finally {
    client.release();
  }
});

// ─── Audits ───────────────────────────────────────────────────────────────────

app.get("/api/audits/login", authenticate, allowRoles(["admin", "auditor"]), async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM login_audits ORDER BY created_at DESC");
  return res.json(rows);
});

// ─── Debug ────────────────────────────────────────────────────────────────────

app.get("/api/debug/reconciliation/:accountId", authenticate, allowRoles(["admin", "auditor"]), async (req, res) => {
  const { rows: acctRows } = await pool.query("SELECT * FROM accounts WHERE id = $1", [req.params.accountId]);
  if (!acctRows[0]) return res.status(404).json({ error: "Account not found" });

  const { rows: txRows } = await pool.query("SELECT type, amount FROM transactions WHERE account_id = $1", [req.params.accountId]);
  const net = Number(txRows.reduce((acc, t) =>
    t.type === "deposit" || t.type === "transfer_in" ? acc + Number(t.amount) : acc - Number(t.amount), 0
  ).toFixed(2));

  return res.json({ accountId: req.params.accountId, accountBalance: Number(acctRows[0].balance), netTransactions: net });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`Asgardeo JWT validation: ${isAsgardeoConfigured() ? "enabled" : "disabled"}`);
});