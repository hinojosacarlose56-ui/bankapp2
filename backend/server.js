const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { z } = require("zod");

dotenv.config();

/* ──────────────── Config ──────────────── */

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const ASGARDEO_ENABLED =
  String(process.env.ASGARDEO_ENABLED || "true").toLowerCase() === "true";
const ASGARDEO_ISSUER_URL = process.env.ASGARDEO_ISSUER_URL || "";
const ASGARDEO_AUDIENCE = process.env.ASGARDEO_AUDIENCE || "";
const ASGARDEO_JWKS_URL = process.env.ASGARDEO_JWKS_URL || "";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

/* ──────────────── Database (Neon + Render SSL) ──────────────── */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // ✅ REQUIRED for Render + Neon
});

pool
  .query("SELECT NOW()")
  .then((r) => console.log("✅ Database connected:", r.rows[0].now))
  .catch((e) => console.error("❌ Database connection failed:", e.message));

/* ──────────────── App ──────────────── */

const app = express();
const invalidatedTokens = new Set();

const allowedOrigins = FRONTEND_ORIGIN.split(",")
  .map((v) => v.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

/* ──────────────── Helpers ──────────────── */

const nowIso = () => new Date().toISOString();
const nextId = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const canPost = (status) => status === "active";

const isAsgardeoConfigured = () =>
  ASGARDEO_ENABLED &&
  Boolean(ASGARDEO_ISSUER_URL) &&
  Boolean(ASGARDEO_AUDIENCE);

/* ──────────────── Auth Helpers ──────────────── */

const normalizeRole = (payload) => {
  const values = [
    payload.role,
    ...(payload.roles || []),
    ...(payload.groups || []),
  ]
    .filter(Boolean)
    .map(String)
    .join(",")
    .toLowerCase();

  if (values.includes("admin")) return "admin";
  if (values.includes("teller")) return "teller";
  if (values.includes("auditor")) return "auditor";
  if (values.includes("customer")) return "customer";

  return "customer"; // ✅ safe default for production
};

const toPrincipal = (payload) => ({
  userId: payload.sub || payload.userId || "external-user",
  email:
    payload.email ||
    payload.preferred_username ||
    payload.username ||
    "",
  role: normalizeRole(payload),
  sub: payload.sub || "",
  claims: payload,
});

let remoteJwks;

const verifyAsgardeoToken = async (token) => {
  const { createRemoteJWKSet, jwtVerify } = await import("jose");

  if (!remoteJwks) {
    const jwks =
      ASGARDEO_JWKS_URL ||
      `${ASGARDEO_ISSUER_URL.replace(/\/$/, "")}/oauth2/jwks`;

    remoteJwks = createRemoteJWKSet(new URL(jwks));
  }

  const { payload } = await jwtVerify(token, remoteJwks, {
    issuer: ASGARDEO_ISSUER_URL,
    audience: ASGARDEO_AUDIENCE,
  });

  return toPrincipal(payload);
};

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return res.status(401).json({ error: "Missing token" });

    const token = header.slice(7);
    if (invalidatedTokens.has(token))
      return res.status(401).json({ error: "Token invalidated" });

    req.auth = await verifyAsgardeoToken(token);
    req.authToken = token;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

const allowRoles =
  (roles) =>
  (req, res, next) =>
    roles.includes(req.auth?.role)
      ? next()
      : res.status(403).json({ error: "Forbidden" });

/* ──────────────── Health ──────────────── */

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "bankapp-backend" })
);

/* ──────────────── TRANSACTIONS (✅ FIXED) ──────────────── */
/* Customers are now allowed */

app.post(
  "/api/transactions/deposit",
  authenticate,
  allowRoles(["admin", "teller", "customer"]),
  async (req, res) => {
    const schema = z.object({
      accountId: z.string(),
      amount: z.number().gt(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad request" });

    const { rows } = await pool.query(
      "SELECT * FROM accounts WHERE id=$1",
      [parsed.data.accountId]
    );
    if (!rows[0] || !canPost(rows[0].status))
      return res.status(400).json({ error: "Account blocked" });

    const newBalance = rows[0].balance + parsed.data.amount;
    await pool.query("UPDATE accounts SET balance=$1 WHERE id=$2", [
      newBalance,
      rows[0].id,
    ]);

    res.status(201).json({ ok: true, balanceAfter: newBalance });
  }
);

app.post(
  "/api/transactions/withdrawal",
  authenticate,
  allowRoles(["admin", "teller", "customer"]),
  async (req, res) => {
    const schema = z.object({
      accountId: z.string(),
      amount: z.number().gt(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad request" });

    const { rows } = await pool.query(
      "SELECT * FROM accounts WHERE id=$1",
      [parsed.data.accountId]
    );

    if (!rows[0] || !canPost(rows[0].status))
      return res.status(400).json({ error: "Account blocked" });

    const newBalance = rows[0].balance - parsed.data.amount;
    if (newBalance < rows[0].overdraft_limit)
      return res
        .status(400)
        .json({ error: "Overdraft limit exceeded" });

    await pool.query("UPDATE accounts SET balance=$1 WHERE id=$2", [
      newBalance,
      rows[0].id,
    ]);

    res.status(201).json({ ok: true, balanceAfter: newBalance });
  }
);

app.post(
  "/api/transactions/transfer",
  authenticate,
  allowRoles(["admin", "teller", "customer"]),
  async (req, res) => {
    const schema = z.object({
      sourceAccountId: z.string(),
      destinationAccountId: z.string(),
      amount: z.number().gt(0),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Bad request" });

    if (
      parsed.data.sourceAccountId ===
      parsed.data.destinationAccountId
    )
      return res
        .status(400)
        .json({ error: "Same-account transfer not allowed" });

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { rows: src } = await client.query(
        "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
        [parsed.data.sourceAccountId]
      );
      const { rows: dst } = await client.query(
        "SELECT * FROM accounts WHERE id=$1 FOR UPDATE",
        [parsed.data.destinationAccountId]
      );

      if (!src[0] || !dst[0])
        throw new Error("Account missing");

      const srcBalance = src[0].balance - parsed.data.amount;
      if (srcBalance < src[0].overdraft_limit)
        throw new Error("Overdraft exceeded");

      await client.query("UPDATE accounts SET balance=$1 WHERE id=$2", [
        srcBalance,
        src[0].id,
      ]);
      await client.query("UPDATE accounts SET balance=$1 WHERE id=$2", [
        dst[0].balance + parsed.data.amount,
        dst[0].id,
      ]);

      await client.query("COMMIT");
      res.status(201).json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: e.message });
    } finally {
      client.release();
    }
  }
);

/* ──────────────── Fallback ──────────────── */

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

/* ──────────────── Start ──────────────── */

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(
    `✅ Asgardeo JWT validation: ${
      isAsgardeoConfigured() ? "enabled" : "disabled"
    }`
  );
});

