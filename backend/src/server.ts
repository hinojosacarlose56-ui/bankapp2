import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { AuthenticatedRequest, allowRoles, requireAuth, signToken } from "./auth";
import {
  accounts,
  addTransaction,
  canPost,
  customers,
  loginAudits,
  maskAccountNumber,
  nextAccountNumber,
  nextId,
  seedDemoData,
  staffUsers,
  sumTransactionsForAccount,
  transactions,
} from "./store";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const invalidatedTokens = new Set<string>();

seedDemoData();

app.use(
  cors({
    origin: [FRONTEND_ORIGIN],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

const auth = requireAuth(invalidatedTokens);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "bank-admin-backend" });
});

app.post("/api/auth/login", async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const { email, password } = parsed.data;
  const user = staffUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
  const success = Boolean(user && user.isActive && passwordOk);

  loginAudits.push({
    email,
    ip: req.ip || "unknown",
    success,
    timestamp: new Date().toISOString(),
  });

  if (!success || !user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({ userId: user.id, role: user.role });
  return res.json({
    accessToken: token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
  });
});

app.post("/api/auth/logout", auth, (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (token) {
    invalidatedTokens.add(token);
  }

  return res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req: AuthenticatedRequest, res) => {
  const user = staffUsers.find((u) => u.id === req.auth?.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  });
});

app.get("/api/users", auth, allowRoles(["admin"]), (_req, res) => {
  return res.json(
    staffUsers.map(({ passwordHash: _passwordHash, ...user }) => user),
  );
});

app.post("/api/users", auth, allowRoles(["admin"]), async (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    role: z.enum(["admin", "teller", "auditor"]),
    password: z.string().min(8),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const exists = staffUsers.some(
    (u) => u.email.toLowerCase() === parsed.data.email.toLowerCase(),
  );
  if (exists) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const user = {
    id: nextId("user"),
    ...parsed.data,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
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

app.get("/api/users/:id", auth, allowRoles(["admin"]), (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return res.json(safeUser);
});

app.put("/api/users/:id", auth, allowRoles(["admin"]), (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const schema = z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    role: z.enum(["admin", "teller", "auditor"]).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  Object.assign(user, parsed.data);
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return res.json(safeUser);
});

app.delete("/api/users/:id", auth, allowRoles(["admin"]), (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.isActive = false;
  return res.json({ ok: true });
});

app.get("/api/customers", auth, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const search = String(req.query.search || "").toLowerCase();
  const list = customers.filter((c) => {
    if (!search) return true;
    return (
      c.firstName.toLowerCase().includes(search) ||
      c.lastName.toLowerCase().includes(search) ||
      c.email.toLowerCase().includes(search)
    );
  });

  return res.json(list);
});

app.post("/api/customers", auth, allowRoles(["admin"]), (req, res) => {
  const schema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(7),
    dateOfBirth: z.string().min(4),
    address: z.string().min(5),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const customer = {
    id: nextId("cust"),
    ...parsed.data,
    isActive: true,
  };

  customers.push(customer);
  return res.status(201).json(customer);
});

app.get("/api/customers/:id", auth, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const customerAccounts = accounts.filter((a) => a.customerId === customer.id);
  return res.json({ ...customer, accounts: customerAccounts });
});

app.put("/api/customers/:id", auth, allowRoles(["admin"]), (req, res) => {
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }

  const schema = z.object({
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    address: z.string().min(5).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  Object.assign(customer, parsed.data);
  return res.json(customer);
});

app.delete("/api/customers/:id", auth, allowRoles(["admin"]), (req, res) => {
  const customer = customers.find((c) => c.id === req.params.id);
  if (!customer) {
    return res.status(404).json({ error: "Customer not found" });
  }

  customer.isActive = false;
  accounts.forEach((account) => {
    if (account.customerId === customer.id && account.status !== "closed") {
      account.status = "frozen";
    }
  });

  return res.json({ ok: true });
});

app.get(
  "/api/customers/:id/accounts",
  auth,
  allowRoles(["admin", "teller", "auditor"]),
  (req, res) => {
    const customerAccounts = accounts.filter((a) => a.customerId === req.params.id);
    return res.json(customerAccounts);
  },
);

app.get("/api/accounts", auth, allowRoles(["admin", "teller", "auditor"]), (_req, res) => {
  return res.json(
    accounts.map((a) => ({
      ...a,
      maskedAccountNumber: maskAccountNumber(a.accountNumber),
    })),
  );
});

app.post("/api/accounts", auth, allowRoles(["admin"]), (req, res) => {
  const schema = z.object({
    customerId: z.string().min(1),
    type: z.enum(["checking", "savings"]),
    apy: z.number().optional(),
    overdraftLimit: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const customer = customers.find((c) => c.id === parsed.data.customerId && c.isActive);
  if (!customer) {
    return res.status(404).json({ error: "Active customer not found" });
  }

  const account = {
    id: nextId("acct"),
    customerId: parsed.data.customerId,
    accountNumber: nextAccountNumber(),
    routingNumber: "021000021",
    type: parsed.data.type,
    status: "active" as const,
    balance: 0,
    apy: parsed.data.type === "savings" ? parsed.data.apy ?? 1.0 : 0,
    overdraftLimit: parsed.data.type === "checking" ? parsed.data.overdraftLimit ?? -250 : 0,
  };

  accounts.push(account);
  return res.status(201).json(account);
});

app.get("/api/accounts/:id", auth, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const account = accounts.find((a) => a.id === req.params.id);
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }

  return res.json({ ...account, maskedAccountNumber: maskAccountNumber(account.accountNumber) });
});

app.put("/api/accounts/:id", auth, allowRoles(["admin"]), (req, res) => {
  const account = accounts.find((a) => a.id === req.params.id);
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }

  const schema = z.object({
    status: z.enum(["active", "frozen", "closed"]).optional(),
    apy: z.number().optional(),
    overdraftLimit: z.number().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  if (parsed.data.status === "closed") {
    account.status = "closed";
    account.closedAt = new Date().toISOString();
  } else if (parsed.data.status) {
    if (account.status === "closed") {
      return res.status(400).json({ error: "Closed accounts cannot be reopened" });
    }
    account.status = parsed.data.status;
  }

  if (account.type === "savings" && parsed.data.apy !== undefined) {
    account.apy = parsed.data.apy;
  }

  if (account.type === "checking" && parsed.data.overdraftLimit !== undefined) {
    account.overdraftLimit = parsed.data.overdraftLimit;
  }

  return res.json(account);
});

app.get("/api/accounts/transactions", auth, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const accountId = String(req.query.accountId || "");
  const list = transactions.filter((t) => (accountId ? t.accountId === accountId : true));
  return res.json(list);
});

app.get("/api/transactions", auth, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const accountId = String(req.query.accountId || "");
  const type = String(req.query.type || "");
  const startDate = String(req.query.startDate || "");
  const endDate = String(req.query.endDate || "");

  const list = transactions.filter((t) => {
    if (accountId && t.accountId !== accountId) return false;
    if (type && t.type !== type) return false;
    if (startDate && t.createdAt < startDate) return false;
    if (endDate && t.createdAt > endDate) return false;
    return true;
  });

  return res.json(list);
});

app.get("/api/transactions/:id", auth, allowRoles(["admin", "teller", "auditor"]), (req, res) => {
  const tx = transactions.find((t) => t.id === req.params.id);
  if (!tx) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  return res.json(tx);
});

const amountSchema = z.object({
  accountId: z.string().min(1),
  amount: z.number().gt(0),
  memo: z.string().optional(),
});

app.post("/api/transactions/deposit", auth, allowRoles(["admin", "teller"]), (req: AuthenticatedRequest, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const account = accounts.find((a) => a.id === parsed.data.accountId);
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }

  if (!canPost(account.status)) {
    return res.status(400).json({ error: "Transactions are blocked for this account status" });
  }

  account.balance = Number((account.balance + parsed.data.amount).toFixed(2));
  const tx = addTransaction(
    account.id,
    "deposit",
    parsed.data.amount,
    account.balance,
    req.auth!.userId,
    parsed.data.memo,
  );

  return res.status(201).json(tx);
});

app.post(
  "/api/transactions/withdrawal",
  auth,
  allowRoles(["admin", "teller"]),
  (req: AuthenticatedRequest, res) => {
    const parsed = amountSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const account = accounts.find((a) => a.id === parsed.data.accountId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!canPost(account.status)) {
      return res.status(400).json({ error: "Transactions are blocked for this account status" });
    }

    const newBalance = Number((account.balance - parsed.data.amount).toFixed(2));
    if (newBalance < account.overdraftLimit) {
      return res.status(400).json({ error: "Withdrawal exceeds overdraft limit" });
    }

    account.balance = newBalance;
    const tx = addTransaction(
      account.id,
      "withdrawal",
      parsed.data.amount,
      account.balance,
      req.auth!.userId,
      parsed.data.memo,
    );

    return res.status(201).json(tx);
  },
);

app.post("/api/transactions/transfer", auth, allowRoles(["admin", "teller"]), (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    sourceAccountId: z.string().min(1),
    destinationAccountId: z.string().min(1),
    amount: z.number().gt(0),
    memo: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const source = accounts.find((a) => a.id === parsed.data.sourceAccountId);
  const destination = accounts.find((a) => a.id === parsed.data.destinationAccountId);

  if (!source || !destination) {
    return res.status(404).json({ error: "Source or destination account not found" });
  }

  if (!canPost(source.status) || !canPost(destination.status)) {
    return res.status(400).json({ error: "Transactions are blocked for one of the accounts" });
  }

  const sourceNewBalance = Number((source.balance - parsed.data.amount).toFixed(2));
  const destinationNewBalance = Number((destination.balance + parsed.data.amount).toFixed(2));

  if (sourceNewBalance < source.overdraftLimit) {
    return res.status(400).json({ error: "Transfer exceeds source overdraft limit" });
  }

  // In-memory atomic section: validate all conditions before mutating state.
  const beforeSource = source.balance;
  const beforeDestination = destination.balance;

  try {
    source.balance = sourceNewBalance;
    destination.balance = destinationNewBalance;

    const transferRef = nextId("xfer");
    const outTx = addTransaction(
      source.id,
      "transfer_out",
      parsed.data.amount,
      source.balance,
      req.auth!.userId,
      parsed.data.memo,
      transferRef,
    );
    const inTx = addTransaction(
      destination.id,
      "transfer_in",
      parsed.data.amount,
      destination.balance,
      req.auth!.userId,
      parsed.data.memo,
      transferRef,
    );

    return res.status(201).json({ transferRef, transferOut: outTx, transferIn: inTx });
  } catch {
    source.balance = beforeSource;
    destination.balance = beforeDestination;
    return res.status(500).json({ error: "Transfer failed and was rolled back" });
  }
});

app.get("/api/audits/login", auth, allowRoles(["admin", "auditor"]), (_req, res) => {
  return res.json(loginAudits);
});

app.get("/api/debug/reconciliation/:accountId", auth, allowRoles(["admin", "auditor"]), (req, res) => {
  const account = accounts.find((a) => a.id === req.params.accountId);
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }

  const net = Number(sumTransactionsForAccount(account.id).toFixed(2));
  return res.json({ accountId: account.id, accountBalance: account.balance, netTransactions: net });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
import pool from "./db";

pool.query("SELECT NOW()").then((res) => {
  console.log("✅ Database connected:", res.rows[0]);
}).catch((err) => {
  console.error("❌ Database connection failed:", err.message);
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
