import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const setAuthToken = (token: string | null): void => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export type Role = "admin" | "teller" | "auditor" | "customer";

export type StaffUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
};

export type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  isActive: boolean;
};

export type Account = {
  id: string;
  customerId: string;
  accountNumber: string;
  maskedAccountNumber?: string;
  routingNumber: string;
  type: "checking" | "savings";
  status: "active" | "frozen" | "closed";
  balance: number;
  apy: number;
  overdraftLimit: number;
  closedAt?: string;
};

export type Transaction = {
  id: string;
  accountId: string;
  type: "deposit" | "withdrawal" | "transfer_out" | "transfer_in";
  amount: number;
  balanceAfter: number;
  memo?: string;
  postedBy: string;
  createdAt: string;
  transferRef?: string;
};

export type LoginAudit = {
  email: string;
  ip: string;
  success: boolean;
  timestamp: string;
};

export type Reconciliation = {
  accountId: string;
  accountBalance: number;
  netTransactions: number;
};

export type ApiErrorInfo = {
  status?: number;
  message: string;
};

const statusMessage: Record<number, string> = {
  400: "The request is invalid. Review inputs and try again.",
  401: "Your session is invalid or expired. Please sign in again.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "Conflict detected. The record may already exist.",
  500: "Server error occurred. Please try again.",
};

export const getApiErrorInfo = (error: unknown): ApiErrorInfo => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseMessage =
      (error.response?.data as { error?: string; message?: string } | undefined)?.error ||
      (error.response?.data as { error?: string; message?: string } | undefined)?.message;

    return {
      status,
      message: responseMessage || (status ? statusMessage[status] : undefined) || "Request failed.",
    };
  }

  return { message: "Unexpected error occurred." };
};

export const authApi = {
  login: async (email: string, password: string): Promise<{ accessToken: string; user: StaffUser }> => {
    const { data } = await api.post<{ accessToken: string; user: StaffUser }>("/auth/login", {
      email,
      password,
    });
    return data;
  },
  logout: async (): Promise<{ ok: boolean }> => {
    const { data } = await api.post<{ ok: boolean }>("/auth/logout");
    return data;
  },
  me: async (): Promise<StaffUser> => {
    const { data } = await api.get<StaffUser>("/auth/me");
    return data;
  },
};

export const usersApi = {
  list: async (): Promise<StaffUser[]> => {
    const { data } = await api.get<StaffUser[]>("/users");
    return data;
  },
  getById: async (id: string): Promise<StaffUser> => {
    const { data } = await api.get<StaffUser>(`/users/${id}`);
    return data;
  },
  create: async (payload: {
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    password: string;
  }): Promise<StaffUser> => {
    const { data } = await api.post<StaffUser>("/users", payload);
    return data;
  },
  update: async (
    id: string,
    payload: { firstName?: string; lastName?: string; role?: Role },
  ): Promise<StaffUser> => {
    const { data } = await api.put<StaffUser>(`/users/${id}`, payload);
    return data;
  },
  deactivate: async (id: string): Promise<{ ok: boolean }> => {
    const { data } = await api.delete<{ ok: boolean }>(`/users/${id}`);
    return data;
  },
};

export const customersApi = {
  list: async (search?: string): Promise<Customer[]> => {
    const { data } = await api.get<Customer[]>("/customers", {
      params: search ? { search } : undefined,
    });
    return data;
  },
  getById: async (id: string): Promise<Customer & { accounts: Account[] }> => {
    const { data } = await api.get<Customer & { accounts: Account[] }>(`/customers/${id}`);
    return data;
  },
  getAccounts: async (id: string): Promise<Account[]> => {
    const { data } = await api.get<Account[]>(`/customers/${id}/accounts`);
    return data;
  },
  create: async (payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    address: string;
  }): Promise<Customer> => {
    const { data } = await api.post<Customer>("/customers", payload);
    return data;
  },
  update: async (
    id: string,
    payload: { email?: string; phone?: string; address?: string },
  ): Promise<Customer> => {
    const { data } = await api.put<Customer>(`/customers/${id}`, payload);
    return data;
  },
  deactivate: async (id: string): Promise<{ ok: boolean }> => {
    const { data } = await api.delete<{ ok: boolean }>(`/customers/${id}`);
    return data;
  },
};

export const accountsApi = {
  list: async (): Promise<Account[]> => {
    const { data } = await api.get<Account[]>("/accounts");
    return data;
  },
  getById: async (id: string): Promise<Account> => {
    const { data } = await api.get<Account>(`/accounts/${id}`);
    return data;
  },
  create: async (payload: {
    customerId: string;
    type: "checking" | "savings";
    apy?: number;
    overdraftLimit?: number;
  }): Promise<Account> => {
    const { data } = await api.post<Account>("/accounts", payload);
    return data;
  },
  update: async (
    id: string,
    payload: {
      status?: "active" | "frozen" | "closed";
      apy?: number;
      overdraftLimit?: number;
    },
  ): Promise<Account> => {
    const { data } = await api.put<Account>(`/accounts/${id}`, payload);
    return data;
  },
};

export const transactionsApi = {
  list: async (params?: {
    accountId?: string;
    type?: "deposit" | "withdrawal" | "transfer_out" | "transfer_in";
    startDate?: string;
    endDate?: string;
  }): Promise<Transaction[]> => {
    const { data } = await api.get<Transaction[]>("/transactions", { params });
    return data;
  },
  getById: async (id: string): Promise<Transaction> => {
    const { data } = await api.get<Transaction>(`/transactions/${id}`);
    return data;
  },
  deposit: async (payload: {
    accountId: string;
    amount: number;
    memo?: string;
  }): Promise<Transaction> => {
    const { data } = await api.post<Transaction>("/transactions/deposit", payload);
    return data;
  },
  withdrawal: async (payload: {
    accountId: string;
    amount: number;
    memo?: string;
  }): Promise<Transaction> => {
    const { data } = await api.post<Transaction>("/transactions/withdrawal", payload);
    return data;
  },
  transfer: async (payload: {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    memo?: string;
  }): Promise<{
    transferRef: string;
    transferOut: Transaction;
    transferIn: Transaction;
  }> => {
    const { data } = await api.post<{
      transferRef: string;
      transferOut: Transaction;
      transferIn: Transaction;
    }>("/transactions/transfer", payload);
    return data;
  },
};

export const auditsApi = {
  listLoginAudits: async (): Promise<LoginAudit[]> => {
    const { data } = await api.get<LoginAudit[]>("/audits/login");
    return data;
  },
  getReconciliation: async (accountId: string): Promise<Reconciliation> => {
    const { data } = await api.get<Reconciliation>(`/debug/reconciliation/${accountId}`);
    return data;
  },
};
