export type Role = "admin" | "teller" | "auditor" | "customer";

export interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Exclude<Role, "customer">;
  passwordHash: string;
  isActive: boolean;
}

export interface CustomerUser {
  id: string;
  customerId: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  isActive: boolean;
}

export type AccountType = "checking" | "savings";
export type AccountStatus = "active" | "frozen" | "closed";

export interface Account {
  id: string;
  customerId: string;
  accountNumber: string;
  routingNumber: string;
  type: AccountType;
  status: AccountStatus;
  balance: number;
  apy: number;
  overdraftLimit: number;
  closedAt?: string;
}

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "transfer_out"
  | "transfer_in";

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  memo?: string;
  postedBy: string;
  createdAt: string;
  transferRef?: string;
}

export interface LoginAudit {
  email: string;
  ip: string;
  success: boolean;
  timestamp: string;
}
