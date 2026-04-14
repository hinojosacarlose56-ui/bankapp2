"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDemoData = exports.addTransaction = exports.sumTransactionsForAccount = exports.canPost = exports.maskAccountNumber = exports.nextAccountNumber = exports.nextId = exports.loginAudits = exports.transactions = exports.accounts = exports.customers = exports.staffUsers = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const nowIso = () => new Date().toISOString();
exports.staffUsers = [
    {
        id: "u_admin",
        firstName: "System",
        lastName: "Admin",
        email: "admin@bank.local",
        role: "admin",
        passwordHash: bcryptjs_1.default.hashSync("Admin123!", 12),
        isActive: true,
    },
    {
        id: "u_teller",
        firstName: "System",
        lastName: "Teller",
        email: "teller@bank.local",
        role: "teller",
        passwordHash: bcryptjs_1.default.hashSync("Teller123!", 12),
        isActive: true,
    },
    {
        id: "u_auditor",
        firstName: "System",
        lastName: "Auditor",
        email: "auditor@bank.local",
        role: "auditor",
        passwordHash: bcryptjs_1.default.hashSync("Auditor123!", 12),
        isActive: true,
    },
];
exports.customers = [];
exports.accounts = [];
exports.transactions = [];
exports.loginAudits = [];
let accountCounter = 1000000000;
const nextId = (prefix) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
exports.nextId = nextId;
const nextAccountNumber = () => {
    accountCounter += 1;
    return String(accountCounter);
};
exports.nextAccountNumber = nextAccountNumber;
const maskAccountNumber = (value) => `******${value.slice(-4)}`;
exports.maskAccountNumber = maskAccountNumber;
const canPost = (status) => status === "active";
exports.canPost = canPost;
const sumTransactionsForAccount = (accountId) => exports.transactions
    .filter((t) => t.accountId === accountId)
    .reduce((acc, t) => {
    if (t.type === "deposit" || t.type === "transfer_in") {
        return acc + t.amount;
    }
    return acc - t.amount;
}, 0);
exports.sumTransactionsForAccount = sumTransactionsForAccount;
const addTransaction = (accountId, type, amount, balanceAfter, postedBy, memo, transferRef) => {
    const record = {
        id: (0, exports.nextId)("txn"),
        accountId,
        type,
        amount,
        balanceAfter,
        memo,
        postedBy,
        createdAt: nowIso(),
        transferRef,
    };
    exports.transactions.push(record);
    return record;
};
exports.addTransaction = addTransaction;
const seedDemoData = () => {
    if (exports.customers.length > 0) {
        return;
    }
    exports.customers.push({
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
        accountNumber: (0, exports.nextAccountNumber)(),
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
        accountNumber: (0, exports.nextAccountNumber)(),
        routingNumber: "021000021",
        type: "savings",
        status: "active",
        balance: 5000,
        apy: 1.5,
        overdraftLimit: 0,
    };
    exports.accounts.push(checking, savings);
    (0, exports.addTransaction)(checking.id, "deposit", 1000, 1000, "u_admin", "Initial deposit");
    (0, exports.addTransaction)(savings.id, "deposit", 5000, 5000, "u_admin", "Initial deposit");
};
exports.seedDemoData = seedDemoData;
