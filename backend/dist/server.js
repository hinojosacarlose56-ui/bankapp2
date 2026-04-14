"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const auth_1 = require("./auth");
const store_1 = require("./store");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const invalidatedTokens = new Set();
(0, store_1.seedDemoData)();
app.use((0, cors_1.default)({
    origin: [FRONTEND_ORIGIN],
    credentials: true,
}));
app.use(express_1.default.json({ limit: "1mb" }));
const auth = (0, auth_1.requireAuth)(invalidatedTokens);
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "bank-admin-backend" });
});
app.post("/api/auth/login", async (req, res) => {
    const schema = zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    const { email, password } = parsed.data;
    const user = store_1.staffUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
    const passwordOk = user ? await bcryptjs_1.default.compare(password, user.passwordHash) : false;
    const success = Boolean(user && user.isActive && passwordOk);
    store_1.loginAudits.push({
        email,
        ip: req.ip || "unknown",
        success,
        timestamp: new Date().toISOString(),
    });
    if (!success || !user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = (0, auth_1.signToken)({ userId: user.id, role: user.role });
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
app.post("/api/auth/logout", auth, (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";
    if (token) {
        invalidatedTokens.add(token);
    }
    return res.json({ ok: true });
});
app.get("/api/auth/me", auth, (req, res) => {
    const user = store_1.staffUsers.find((u) => u.id === req.auth?.userId);
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
app.get("/api/users", auth, (0, auth_1.allowRoles)(["admin"]), (_req, res) => {
    return res.json(store_1.staffUsers.map(({ passwordHash: _passwordHash, ...user }) => user));
});
app.post("/api/users", auth, (0, auth_1.allowRoles)(["admin"]), async (req, res) => {
    const schema = zod_1.z.object({
        firstName: zod_1.z.string().min(1),
        lastName: zod_1.z.string().min(1),
        email: zod_1.z.string().email(),
        role: zod_1.z.enum(["admin", "teller", "auditor"]),
        password: zod_1.z.string().min(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    const exists = store_1.staffUsers.some((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (exists) {
        return res.status(409).json({ error: "Email already exists" });
    }
    const user = {
        id: (0, store_1.nextId)("user"),
        ...parsed.data,
        passwordHash: await bcryptjs_1.default.hash(parsed.data.password, 12),
        isActive: true,
    };
    store_1.staffUsers.push(user);
    return res.status(201).json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
    });
});
app.get("/api/users/:id", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const user = store_1.staffUsers.find((u) => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return res.json(safeUser);
});
app.put("/api/users/:id", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const user = store_1.staffUsers.find((u) => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    const schema = zod_1.z.object({
        firstName: zod_1.z.string().min(1).optional(),
        lastName: zod_1.z.string().min(1).optional(),
        role: zod_1.z.enum(["admin", "teller", "auditor"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    Object.assign(user, parsed.data);
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return res.json(safeUser);
});
app.delete("/api/users/:id", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const user = store_1.staffUsers.find((u) => u.id === req.params.id);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    user.isActive = false;
    return res.json({ ok: true });
});
app.get("/api/customers", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (req, res) => {
    const search = String(req.query.search || "").toLowerCase();
    const list = store_1.customers.filter((c) => {
        if (!search)
            return true;
        return (c.firstName.toLowerCase().includes(search) ||
            c.lastName.toLowerCase().includes(search) ||
            c.email.toLowerCase().includes(search));
    });
    return res.json(list);
});
app.post("/api/customers", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const schema = zod_1.z.object({
        firstName: zod_1.z.string().min(1),
        lastName: zod_1.z.string().min(1),
        email: zod_1.z.string().email(),
        phone: zod_1.z.string().min(7),
        dateOfBirth: zod_1.z.string().min(4),
        address: zod_1.z.string().min(5),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    const customer = {
        id: (0, store_1.nextId)("cust"),
        ...parsed.data,
        isActive: true,
    };
    store_1.customers.push(customer);
    return res.status(201).json(customer);
});
app.get("/api/customers/:id", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (req, res) => {
    const customer = store_1.customers.find((c) => c.id === req.params.id);
    if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
    }
    const customerAccounts = store_1.accounts.filter((a) => a.customerId === customer.id);
    return res.json({ ...customer, accounts: customerAccounts });
});
app.put("/api/customers/:id", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const customer = store_1.customers.find((c) => c.id === req.params.id);
    if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
    }
    const schema = zod_1.z.object({
        email: zod_1.z.string().email().optional(),
        phone: zod_1.z.string().min(7).optional(),
        address: zod_1.z.string().min(5).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    Object.assign(customer, parsed.data);
    return res.json(customer);
});
app.delete("/api/customers/:id", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const customer = store_1.customers.find((c) => c.id === req.params.id);
    if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
    }
    customer.isActive = false;
    store_1.accounts.forEach((account) => {
        if (account.customerId === customer.id && account.status !== "closed") {
            account.status = "frozen";
        }
    });
    return res.json({ ok: true });
});
app.get("/api/customers/:id/accounts", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (req, res) => {
    const customerAccounts = store_1.accounts.filter((a) => a.customerId === req.params.id);
    return res.json(customerAccounts);
});
app.get("/api/accounts", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (_req, res) => {
    return res.json(store_1.accounts.map((a) => ({
        ...a,
        maskedAccountNumber: (0, store_1.maskAccountNumber)(a.accountNumber),
    })));
});
app.post("/api/accounts", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const schema = zod_1.z.object({
        customerId: zod_1.z.string().min(1),
        type: zod_1.z.enum(["checking", "savings"]),
        apy: zod_1.z.number().optional(),
        overdraftLimit: zod_1.z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    const customer = store_1.customers.find((c) => c.id === parsed.data.customerId && c.isActive);
    if (!customer) {
        return res.status(404).json({ error: "Active customer not found" });
    }
    const account = {
        id: (0, store_1.nextId)("acct"),
        customerId: parsed.data.customerId,
        accountNumber: (0, store_1.nextAccountNumber)(),
        routingNumber: "021000021",
        type: parsed.data.type,
        status: "active",
        balance: 0,
        apy: parsed.data.type === "savings" ? parsed.data.apy ?? 1.0 : 0,
        overdraftLimit: parsed.data.type === "checking" ? parsed.data.overdraftLimit ?? -250 : 0,
    };
    store_1.accounts.push(account);
    return res.status(201).json(account);
});
app.get("/api/accounts/:id", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (req, res) => {
    const account = store_1.accounts.find((a) => a.id === req.params.id);
    if (!account) {
        return res.status(404).json({ error: "Account not found" });
    }
    return res.json({ ...account, maskedAccountNumber: (0, store_1.maskAccountNumber)(account.accountNumber) });
});
app.put("/api/accounts/:id", auth, (0, auth_1.allowRoles)(["admin"]), (req, res) => {
    const account = store_1.accounts.find((a) => a.id === req.params.id);
    if (!account) {
        return res.status(404).json({ error: "Account not found" });
    }
    const schema = zod_1.z.object({
        status: zod_1.z.enum(["active", "frozen", "closed"]).optional(),
        apy: zod_1.z.number().optional(),
        overdraftLimit: zod_1.z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    if (parsed.data.status === "closed") {
        account.status = "closed";
        account.closedAt = new Date().toISOString();
    }
    else if (parsed.data.status) {
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
app.get("/api/accounts/transactions", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (req, res) => {
    const accountId = String(req.query.accountId || "");
    const list = store_1.transactions.filter((t) => (accountId ? t.accountId === accountId : true));
    return res.json(list);
});
app.get("/api/transactions", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (req, res) => {
    const accountId = String(req.query.accountId || "");
    const type = String(req.query.type || "");
    const startDate = String(req.query.startDate || "");
    const endDate = String(req.query.endDate || "");
    const list = store_1.transactions.filter((t) => {
        if (accountId && t.accountId !== accountId)
            return false;
        if (type && t.type !== type)
            return false;
        if (startDate && t.createdAt < startDate)
            return false;
        if (endDate && t.createdAt > endDate)
            return false;
        return true;
    });
    return res.json(list);
});
app.get("/api/transactions/:id", auth, (0, auth_1.allowRoles)(["admin", "teller", "auditor"]), (req, res) => {
    const tx = store_1.transactions.find((t) => t.id === req.params.id);
    if (!tx) {
        return res.status(404).json({ error: "Transaction not found" });
    }
    return res.json(tx);
});
const amountSchema = zod_1.z.object({
    accountId: zod_1.z.string().min(1),
    amount: zod_1.z.number().gt(0),
    memo: zod_1.z.string().optional(),
});
app.post("/api/transactions/deposit", auth, (0, auth_1.allowRoles)(["admin", "teller"]), (req, res) => {
    const parsed = amountSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    const account = store_1.accounts.find((a) => a.id === parsed.data.accountId);
    if (!account) {
        return res.status(404).json({ error: "Account not found" });
    }
    if (!(0, store_1.canPost)(account.status)) {
        return res.status(400).json({ error: "Transactions are blocked for this account status" });
    }
    account.balance = Number((account.balance + parsed.data.amount).toFixed(2));
    const tx = (0, store_1.addTransaction)(account.id, "deposit", parsed.data.amount, account.balance, req.auth.userId, parsed.data.memo);
    return res.status(201).json(tx);
});
app.post("/api/transactions/withdrawal", auth, (0, auth_1.allowRoles)(["admin", "teller"]), (req, res) => {
    const parsed = amountSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    const account = store_1.accounts.find((a) => a.id === parsed.data.accountId);
    if (!account) {
        return res.status(404).json({ error: "Account not found" });
    }
    if (!(0, store_1.canPost)(account.status)) {
        return res.status(400).json({ error: "Transactions are blocked for this account status" });
    }
    const newBalance = Number((account.balance - parsed.data.amount).toFixed(2));
    if (newBalance < account.overdraftLimit) {
        return res.status(400).json({ error: "Withdrawal exceeds overdraft limit" });
    }
    account.balance = newBalance;
    const tx = (0, store_1.addTransaction)(account.id, "withdrawal", parsed.data.amount, account.balance, req.auth.userId, parsed.data.memo);
    return res.status(201).json(tx);
});
app.post("/api/transactions/transfer", auth, (0, auth_1.allowRoles)(["admin", "teller"]), (req, res) => {
    const schema = zod_1.z.object({
        sourceAccountId: zod_1.z.string().min(1),
        destinationAccountId: zod_1.z.string().min(1),
        amount: zod_1.z.number().gt(0),
        memo: zod_1.z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request payload" });
    }
    const source = store_1.accounts.find((a) => a.id === parsed.data.sourceAccountId);
    const destination = store_1.accounts.find((a) => a.id === parsed.data.destinationAccountId);
    if (!source || !destination) {
        return res.status(404).json({ error: "Source or destination account not found" });
    }
    if (!(0, store_1.canPost)(source.status) || !(0, store_1.canPost)(destination.status)) {
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
        const transferRef = (0, store_1.nextId)("xfer");
        const outTx = (0, store_1.addTransaction)(source.id, "transfer_out", parsed.data.amount, source.balance, req.auth.userId, parsed.data.memo, transferRef);
        const inTx = (0, store_1.addTransaction)(destination.id, "transfer_in", parsed.data.amount, destination.balance, req.auth.userId, parsed.data.memo, transferRef);
        return res.status(201).json({ transferRef, transferOut: outTx, transferIn: inTx });
    }
    catch {
        source.balance = beforeSource;
        destination.balance = beforeDestination;
        return res.status(500).json({ error: "Transfer failed and was rolled back" });
    }
});
app.get("/api/audits/login", auth, (0, auth_1.allowRoles)(["admin", "auditor"]), (_req, res) => {
    return res.json(store_1.loginAudits);
});
app.get("/api/debug/reconciliation/:accountId", auth, (0, auth_1.allowRoles)(["admin", "auditor"]), (req, res) => {
    const account = store_1.accounts.find((a) => a.id === req.params.accountId);
    if (!account) {
        return res.status(404).json({ error: "Account not found" });
    }
    const net = Number((0, store_1.sumTransactionsForAccount)(account.id).toFixed(2));
    return res.json({ accountId: account.id, accountBalance: account.balance, netTransactions: net });
});
app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
});
app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
});
