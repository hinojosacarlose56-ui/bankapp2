import bcrypt from "bcryptjs";
import {
  Account,
  Customer,
  CustomerUser,
  LoginAudit,
  StaffUser,
  Transaction,
  TransactionType,
} from "./types";

const nowIso = () => new Date().toISOString();

export const staffUsers: StaffUser[] = [
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

export const customers: Customer[] = [];
export const customerUsers: CustomerUser[] = [];
export const accounts: Account[] = [];
export const transactions: Transaction[] = [];
export const loginAudits: LoginAudit[] = [];

let accountCounter = 1000000000;

export const nextId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

export const nextAccountNumber = (): string => {
  accountCounter += 1;
  return String(accountCounter);
};

export const maskAccountNumber = (value: string): string =>
  `******${value.slice(-4)}`;

export const canPost = (status: Account["status"]): boolean => status === "active";

export const sumTransactionsForAccount = (accountId: string): number =>
  transactions
    .filter((t) => t.accountId === accountId)
    .reduce((acc, t) => {
      if (t.type === "deposit" || t.type === "transfer_in") {
        return acc + t.amount;
      }
      return acc - t.amount;
    }, 0);

export const addTransaction = (
  accountId: string,
  type: TransactionType,
  amount: number,
  balanceAfter: number,
  postedBy: string,
  memo?: string,
  transferRef?: string,
): Transaction => {
  const record: Transaction = {
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

export const seedDemoData = (): void => {
  if (customers.length > 0) {
    return;
  }

  const demoCustomer: Customer = {
    id: "c_demo",
    firstName: "Demo",
    lastName: "Customer",
    email: "demo.customer@bank.local",
    phone: "555-111-2222",
    dateOfBirth: "1990-01-01",
    address: "100 Main St, Anytown",
    isActive: true,
  };

  customers.push(demoCustomer);
  customerUsers.push({
    id: "cu_demo",
    customerId: demoCustomer.id,
    email: demoCustomer.email,
    passwordHash: bcrypt.hashSync("Customer123!", 12),
    isActive: true,
  });

  const checking: Account = {
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

  const savings: Account = {
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
