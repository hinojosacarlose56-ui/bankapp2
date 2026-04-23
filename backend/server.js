const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ASGARDEO_ENABLED = String(process.env.ASGARDEO_ENABLED || "true").toLowerCase() === "true";
const ASGARDEO_ISSUER_URL = process.env.ASGARDEO_ISSUER_URL || "";
const ASGARDEO_AUDIENCE = process.env.ASGARDEO_AUDIENCE || "";
const ASGARDEO_JWKS_URL = process.env.ASGARDEO_JWKS_URL || "";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const app = express();
const invalidatedTokens = new Set();

const splitOrigins = FRONTEND_ORIGIN.split(",").map((v) => v.trim()).filter(Boolean);
app.use(cors({ origin: splitOrigins.length ? splitOrigins : ["http://localhost:5173"], credentials: true }));
app.use(express.json({ limit: "1mb" }));

const nowIso = () => new Date().toISOString();

const staffUsers = [
  {
    id: "u_admin",
    firstName: "System",
    lastName: "Admin",
    email: "admin@bank.local",
    role: "admin",
    passwordHash: bcrypt.hashSync("Admin123!", 12),
    isActive: true,
  },
  {
    id: "u_teller",
    firstName: "System",
    lastName: "Teller",
    email: "teller@bank.local",
    role: "teller",
    passwordHash: bcrypt.hashSync("Teller123!", 12),
    isActive: true,
  },
  {
    id: "u_auditor",
    firstName: "System",
    lastName: "Auditor",
    email: "auditor@bank.local",
    role: "auditor",
    passwordHash: bcrypt.hashSync("Auditor123!", 12),
    isActive: true,
  },
];

const customers = [];
const accounts = [];
const transactions = [];
const loginAudits = [];
let accountCounter = 1000000000;
let remoteJwks;

const nextId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const nextAccountNumber = () => String(++accountCounter);
const maskAccountNumber = (value) => `******${String(value).slice(-4)}`;
const canPost = (status) => status === "active";

const sumTransactionsForAccount = (accountId) =>
  transactions
    .filter((t) => t.accountId === accountId)
    .reduce((acc, t) => (t.type === "deposit" || t.type === "transfer_in" ? acc + t.amount : acc - t.amount), 0);

const addTransaction = (accountId, type, amount, balanceAfter, postedBy, memo, transferRef) => {
  const record = {
    id: nextId("txn"),
    accountId,
    type,
    amount,
    balanceAfter,
    memo,
    postedBy,
    createdAt: nowIso(),
    transferRef,
  };
  transactions.push(record);
  return record;
};

const seedDemoData = () => {
  if (customers.length > 0) return;

  customers.push({
    id: "c_demo",
    firstName: "Demo",
    lastName: "Customer",
    email: "demo.customer@bank.local",
    phone: "555-111-2222",
    dateOfBirth: "1990-01-01",
    address: "100 Main St, Anytown",
    isActive: true,
  });

  const checking = {
    id: "a_demo_check",
    customerId: "c_demo",
    accountNumber: nextAccountNumber(),
    routingNumber: "021000021",
    type: "checking",
    status: "active",
    balance: 1000,
    apy: 0,
    overdraftLimit: -500,
  };

  const savings = {
    id: "a_demo_save",
    customerId: "c_demo",
    accountNumber: nextAccountNumber(),
    routingNumber: "021000021",
    type: "savings",
    status: "active",
    balance: 5000,
    apy: 1.5,
    overdraftLimit: 0,
  };

  accounts.push(checking, savings);
  addTransaction(checking.id, "deposit", 1000, 1000, "u_admin", "Initial deposit");
  addTransaction(savings.id, "deposit", 5000, 5000, "u_admin", "Initial deposit");
};

seedDemoData();

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
  }

  return null;
};

const toPrincipal = (payload) => {
  const email = payload.email || payload.username || payload.preferred_username || "";
  const userId = payload.userId || payload.sub || email || "external-user";

  return {
    userId: String(userId),
    role: normalizeRole(payload),
    email: String(email || ""),
    sub: String(payload.sub || ""),
    claims: payload,
  };
};

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "bank-admin-backend" });
});

app.post("/api/auth/login", async (req, res) => {
  if (isAsgardeoConfigured()) {
    return res.status(400).json({ error: "Direct login disabled. Use Asgardeo sign-in." });
  }

  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const { email, password } = parsed.data;
  const user = staffUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
  const success = Boolean(user && user.isActive && passwordOk);

  loginAudits.push({ email, ip: req.ip || "unknown", success, timestamp: nowIso() });

  if (!success || !user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = jwt.sign(
    { userId: user.id, role: user.role, email: user.email, name: `${user.firstName} ${user.lastName}` },
    JWT_SECRET,
    { expiresIn: "8h" },
  );

  return res.json({
    accessToken,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

app.post("/api/auth/logout", authenticate, (req, res) => {
  if (req.authToken) invalidatedTokens.add(req.authToken);
  return res.json({ ok: true });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  const email = String(req.auth.email || "").toLowerCase();
  const known = staffUsers.find((u) => u.email.toLowerCase() === email);

  if (known) {
    return res.json({
      id: known.id,
      firstName: known.firstName,
      lastName: known.lastName,
      email: known.email,
      role: known.role,
      isActive: known.isActive,
      authProvider: isAsgardeoConfigured() ? "asgardeo" : "local",
    });
  }

  return res.json({
    id: req.auth.userId,
    firstName: "External",
    lastName: "User",
    email: req.auth.email || "",
    role: req.auth.role || "auditor",
    isActive: true,
    authProvider: "asgardeo",
  });
});

app.get("/api/users", authenticate, allowRoles(["admin"]), (_req, res) => {
  return res.json(staffUsers.map(({ passwordHash, ...user }) => user));
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

  const exists = staffUsers.some((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (exists) return res.status(409).json({ error: "Email already exists" });

  const user = {
    id: nextId("user"),
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    role: parsed.data.role,
    passwordHash: await bcrypt.hash(parsed.data.password || "TempPass123!", 12),
    isActive: true,
  };

  staffUsers.push(user);
  return res.status(201).json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  });
});

app.get("/api/users/:id", authenticate, allowRoles(["admin"]), (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { passwordHash, ...safeUser } = user;
  return res.json(safeUser);
});

app.put("/api/users/:id", authenticate, allowRoles(["admin"]), (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const schema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    role: z.enum(["admin", "teller", "auditor"]).optional(),
    isActive: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  Object.assign(user, parsed.data);
  const { passwordHash, ...safeUser } = user;
  return res.json(safeUser);
});

app.delete("/api/users/:id", authenticate, allowRoles(["admin"]), (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.isActive = false;
  return res.json({ ok: true });
});

app.get("/api/customers", authenticate, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const search = String(req.query.search || "").toLowerCase();
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 50);

  const filtered = customers.filter((c) => {
    if (!search) return true;
    return (
      c.firstName.toLowerCase().includes(search) ||
      c.lastName.toLowerCase().includes(search) ||
      c.email.toLowerCase().includes(search)
    );
  });

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return res.json({ items, page, pageSize, total: filtered.length });
});

app.post("/api/customers", authenticate, allowRoles(["admin"]), (req, res) => {
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

  const customer = { id: nextId("cust"), ...parsed.data, isActive: true };
  customers.push(customer);
  return res.status(201).json(customer);
});

app.get("/api/customers/:id", authenticate, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  const customerAccounts = accounts.filter((a) => a.customerId === customer.id);
  return res.json({ ...customer, accounts: customerAccounts });
});

app.put("/api/customers/:id", authenticate, allowRoles(["admin"]), (req, res) => {
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  const schema = z.object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    address: z.string().min(5).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  Object.assign(customer, parsed.data);
  return res.json(customer);
});

app.delete("/api/customers/:id", authenticate, allowRoles(["admin"]), (req, res) => {
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) return res.status(404).json({ error: "Customer not found" });

  customer.isActive = false;
  accounts.forEach((account) => {
    if (account.customerId === customer.id && account.status !== "closed") {
      account.status = "frozen";
    }
  });

  return res.json({ ok: true });
});

app.get("/api/customers/:id/accounts", authenticate, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const customerAccounts = accounts.filter((a) => a.customerId === req.params.id);
  return res.json(customerAccounts);
});

app.get("/api/accounts", authenticate, allowRoles(["admin", "teller", "auditor"]), (_req, res) => {
  return res.json(accounts.map((a) => ({ ...a, maskedAccountNumber: maskAccountNumber(a.accountNumber) })));
});

app.post("/api/accounts", authenticate, allowRoles(["admin"]), (req, res) => {
  const schema = z.object({
    customerId: z.string().min(1),
    type: z.enum(["checking", "savings"]),
    apy: z.number().optional(),
    overdraftLimit: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const customer = customers.find((c) => c.id === parsed.data.customerId && c.isActive);
  if (!customer) return res.status(404).json({ error: "Active customer not found" });

  const account = {
    id: nextId("acct"),
    customerId: parsed.data.customerId,
    accountNumber: nextAccountNumber(),
    routingNumber: "021000021",
    type: parsed.data.type,
    status: "active",
    balance: 0,
    apy: parsed.data.type === "savings" ? parsed.data.apy ?? 1.0 : 0,
    overdraftLimit: parsed.data.type === "checking" ? parsed.data.overdraftLimit ?? -250 : 0,
  };

  accounts.push(account);
  return res.status(201).json(account);
});

app.get("/api/accounts/:id", authenticate, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const account = accounts.find((a) => a.id === req.params.id);
  if (!account) return res.status(404).json({ error: "Account not found" });
  return res.json({ ...account, maskedAccountNumber: maskAccountNumber(account.accountNumber) });
});

app.put("/api/accounts/:id", authenticate, allowRoles(["admin"]), (req, res) => {
  const account = accounts.find((a) => a.id === req.params.id);
  if (!account) return res.status(404).json({ error: "Account not found" });

  const schema = z.object({
    status: z.enum(["active", "frozen", "closed"]).optional(),
    apy: z.number().optional(),
    overdraftLimit: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  if (parsed.data.status === "closed") {
    account.status = "closed";
    account.closedAt = nowIso();
  } else if (parsed.data.status) {
    if (account.status === "closed") return res.status(400).json({ error: "Closed accounts cannot be reopened" });
    account.status = parsed.data.status;
  }

  if (account.type === "savings" && parsed.data.apy !== undefined) account.apy = parsed.data.apy;
  if (account.type === "checking" && parsed.data.overdraftLimit !== undefined) account.overdraftLimit = parsed.data.overdraftLimit;

  return res.json(account);
});

app.get("/api/accounts/transactions", authenticate, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const accountId = String(req.query.accountId || "");
  const list = transactions.filter((t) => (accountId ? t.accountId === accountId : true));
  return res.json(list);
});

app.get("/api/transactions", authenticate, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const accountId = String(req.query.accountId || "");
  const type = String(req.query.type || "");
  const startDate = String(req.query.startDate || "");
  const endDate = String(req.query.endDate || "");
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 50);

  const filtered = transactions.filter((t) => {
    if (accountId && t.accountId !== accountId) return false;
    if (type && t.type !== type) return false;
    if (startDate && t.createdAt < startDate) return false;
    if (endDate && t.createdAt > endDate) return false;
    return true;
  });

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return res.json({ items, page, pageSize, total: filtered.length });
});

app.get("/api/transactions/:id", authenticate, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const tx = transactions.find((t) => t.id === req.params.id);
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  return res.json(tx);
});

const amountSchema = z.object({ accountId: z.string().min(1), amount: z.number().gt(0), memo: z.string().optional() });

app.post("/api/transactions/deposit", authenticate, allowRoles(["admin", "teller"]), (req, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const account = accounts.find((a) => a.id === parsed.data.accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (!canPost(account.status)) return res.status(400).json({ error: "Transactions are blocked for this account status" });

  account.balance = Number((account.balance + parsed.data.amount).toFixed(2));
  const tx = addTransaction(account.id, "deposit", parsed.data.amount, account.balance, req.auth.userId, parsed.data.memo);
  return res.status(201).json(tx);
});

app.post("/api/transactions/withdrawal", authenticate, allowRoles(["admin", "teller"]), (req, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const account = accounts.find((a) => a.id === parsed.data.accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (!canPost(account.status)) return res.status(400).json({ error: "Transactions are blocked for this account status" });

  const newBalance = Number((account.balance - parsed.data.amount).toFixed(2));
  if (newBalance < account.overdraftLimit) {
    return res.status(400).json({ error: "Withdrawal exceeds overdraft limit" });
  }

  account.balance = newBalance;
  const tx = addTransaction(account.id, "withdrawal", parsed.data.amount, account.balance, req.auth.userId, parsed.data.memo);
  return res.status(201).json(tx);
});

app.post("/api/transactions/transfer", authenticate, allowRoles(["admin", "teller"]), (req, res) => {
  const schema = z.object({
    sourceAccountId: z.string().min(1),
    destinationAccountId: z.string().min(1),
    amount: z.number().gt(0),
    memo: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request payload" });

  const source = accounts.find((a) => a.id === parsed.data.sourceAccountId);
  const destination = accounts.find((a) => a.id === parsed.data.destinationAccountId);
  if (!source || !destination) return res.status(404).json({ error: "Source or destination account not found" });

  if (!canPost(source.status) || !canPost(destination.status)) {
    return res.status(400).json({ error: "Transactions are blocked for one of the accounts" });
  }

  const sourceNewBalance = Number((source.balance - parsed.data.amount).toFixed(2));
  const destinationNewBalance = Number((destination.balance + parsed.data.amount).toFixed(2));
  if (sourceNewBalance < source.overdraftLimit) {
    return res.status(400).json({ error: "Transfer exceeds source overdraft limit" });
  }

  const beforeSource = source.balance;
  const beforeDestination = destination.balance;

  try {
    source.balance = sourceNewBalance;
    destination.balance = destinationNewBalance;

    const transferRef = nextId("xfer");
    const transferOut = addTransaction(source.id, "transfer_out", parsed.data.amount, source.balance, req.auth.userId, parsed.data.memo, transferRef);
    const transferIn = addTransaction(destination.id, "transfer_in", parsed.data.amount, destination.balance, req.auth.userId, parsed.data.memo, transferRef);

    return res.status(201).json({ transferRef, transferOut, transferIn });
  } catch {
    source.balance = beforeSource;
    destination.balance = beforeDestination;
    return res.status(500).json({ error: "Transfer failed and was rolled back" });
  }
});

app.get("/api/audits/login", authenticate, allowRoles(["admin", "auditor"]), (_req, res) => {
  return res.json(loginAudits);
});

app.get("/api/debug/reconciliation/:accountId", authenticate, allowRoles(["admin", "auditor"]), (req, res) => {
  const account = accounts.find((a) => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  const net = Number(sumTransactionsForAccount(account.id).toFixed(2));
  return res.json({ accountId: account.id, accountBalance: account.balance, netTransactions: net });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`Asgardeo JWT validation: ${isAsgardeoConfigured() ? "enabled" : "disabled"}`);
});
