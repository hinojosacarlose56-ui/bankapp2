import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api, setAuthToken } from "./api";
import "./App.css";

type Role = "admin" | "teller" | "auditor";

type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
};

type Account = {
  id: string;
  customerId: string;
  accountNumber: string;
  maskedAccountNumber?: string;
  type: "checking" | "savings";
  status: "active" | "frozen" | "closed";
  balance: number;
};

type Tx = {
  id: string;
  accountId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  memo?: string;
  createdAt: string;
};

const tokenStorageKey = "bank_admin_token";

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(tokenStorageKey));
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("admin@bank.local");
  const [password, setPassword] = useState("Admin123!");
  const [message, setMessage] = useState("Ready");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);

  const [newCustomerName, setNewCustomerName] = useState("Jane Doe");
  const [newCustomerEmail, setNewCustomerEmail] = useState("jane.doe@bank.local");

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newAccountType, setNewAccountType] = useState<"checking" | "savings">("checking");

  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState(100);

  const canManageCustomers = useMemo(() => user?.role === "admin", [user]);
  const canPostTransactions = useMemo(
    () => user?.role === "admin" || user?.role === "teller",
    [user],
  );

  useEffect(() => {
    setAuthToken(token);
    if (!token) {
      setUser(null);
      return;
    }
    void loadMe();
  }, [token]);

  const loadMe = async (): Promise<void> => {
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
      await Promise.all([loadCustomers(), loadAccounts(), loadTransactions()]);
    } catch {
      localStorage.removeItem(tokenStorageKey);
      setToken(null);
      setMessage("Session expired. Please log in again.");
    }
  };

  const loadCustomers = async (): Promise<void> => {
    const { data } = await api.get<Customer[]>("/customers");
    setCustomers(data);
  };

  const loadAccounts = async (): Promise<void> => {
    const { data } = await api.get<Account[]>("/accounts");
    setAccounts(data);
  };

  const loadTransactions = async (): Promise<void> => {
    const { data } = await api.get<Tx[]>("/transactions");
    setTransactions(data.slice().reverse());
  };

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { data } = await api.post<{ accessToken: string }>("/auth/login", { email, password });
      localStorage.setItem(tokenStorageKey, data.accessToken);
      setToken(data.accessToken);
      setMessage("Login successful.");
    } catch {
      setMessage("Invalid credentials.");
    }
  };

  const onLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore logout failures during local dev teardown.
    }
    localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setMessage("Logged out.");
  };

  const createCustomer = async () => {
    if (!canManageCustomers) return;
    const [firstName, ...rest] = newCustomerName.trim().split(" ");
    const lastName = rest.join(" ") || "Customer";
    await api.post("/customers", {
      firstName,
      lastName,
      email: newCustomerEmail,
      phone: "555-333-4444",
      dateOfBirth: "1992-02-02",
      address: "500 Market Street",
    });
    await loadCustomers();
    setMessage("Customer created.");
  };

  const createAccount = async () => {
    if (!canManageCustomers || !selectedCustomerId) return;
    await api.post("/accounts", {
      customerId: selectedCustomerId,
      type: newAccountType,
    });
    await loadAccounts();
    setMessage("Account opened.");
  };

  const postDeposit = async () => {
    if (!canPostTransactions || !transactionAccountId) return;
    await api.post("/transactions/deposit", { accountId: transactionAccountId, amount, memo: "MVP deposit" });
    await Promise.all([loadAccounts(), loadTransactions()]);
    setMessage("Deposit posted.");
  };

  const postWithdrawal = async () => {
    if (!canPostTransactions || !transactionAccountId) return;
    await api.post("/transactions/withdrawal", {
      accountId: transactionAccountId,
      amount,
      memo: "MVP withdrawal",
    });
    await Promise.all([loadAccounts(), loadTransactions()]);
    setMessage("Withdrawal posted.");
  };

  const postTransfer = async () => {
    if (!canPostTransactions || !transactionAccountId || !destinationAccountId) return;
    await api.post("/transactions/transfer", {
      sourceAccountId: transactionAccountId,
      destinationAccountId,
      amount,
      memo: "MVP transfer",
    });
    await Promise.all([loadAccounts(), loadTransactions()]);
    setMessage("Transfer posted.");
  };

  if (!user) {
    return (
      <main className="container">
        <section className="card login-card">
          <h1>Bank Admin MVP</h1>
          <p>Log in with seeded staff users.</p>
          <form onSubmit={onLogin}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
            <button type="submit">Log In</button>
          </form>
          <small>
            Admin: admin@bank.local / Admin123! | Teller: teller@bank.local / Teller123! |
            Auditor: auditor@bank.local / Auditor123!
          </small>
          <p className="message">{message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="card header-row">
        <div>
          <h1>Bank Admin MVP</h1>
          <p>
            Logged in as {user.firstName} {user.lastName} ({user.role})
          </p>
        </div>
        <button onClick={onLogout}>Log Out</button>
      </header>

      <section className="grid">
        <article className="card">
          <h2>Customers</h2>
          <div className="inline-fields">
            <input
              placeholder="Full name"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
            />
            <input
              placeholder="Email"
              value={newCustomerEmail}
              onChange={(e) => setNewCustomerEmail(e.target.value)}
            />
            <button onClick={createCustomer} disabled={!canManageCustomers}>
              Add Customer
            </button>
          </div>
          <ul className="list">
            {customers.map((customer) => (
              <li key={customer.id}>
                <strong>{customer.firstName} {customer.lastName}</strong>
                <span>{customer.email}</span>
                <span>{customer.isActive ? "active" : "inactive"}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Accounts</h2>
          <div className="inline-fields">
            <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.firstName} {customer.lastName}
                </option>
              ))}
            </select>
            <select
              value={newAccountType}
              onChange={(e) => setNewAccountType(e.target.value as "checking" | "savings")}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
            <button onClick={createAccount} disabled={!canManageCustomers}>
              Open Account
            </button>
          </div>

          <ul className="list">
            {accounts.map((account) => (
              <li key={account.id}>
                <strong>{account.type}</strong>
                <span>{account.maskedAccountNumber || account.accountNumber}</span>
                <span>${account.balance.toFixed(2)}</span>
                <span>{account.status}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Transactions</h2>
          <div className="inline-fields">
            <select value={transactionAccountId} onChange={(e) => setTransactionAccountId(e.target.value)}>
              <option value="">Source account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.maskedAccountNumber || account.accountNumber}
                </option>
              ))}
            </select>
            <select value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)}>
              <option value="">Destination account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.maskedAccountNumber || account.accountNumber}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="inline-fields">
            <button onClick={postDeposit} disabled={!canPostTransactions}>Deposit</button>
            <button onClick={postWithdrawal} disabled={!canPostTransactions}>Withdraw</button>
            <button onClick={postTransfer} disabled={!canPostTransactions}>Transfer</button>
          </div>

          <ul className="list">
            {transactions.slice(0, 12).map((tx) => (
              <li key={tx.id}>
                <strong>{tx.type}</strong>
                <span>${tx.amount.toFixed(2)}</span>
                <span>balance ${tx.balanceAfter.toFixed(2)}</span>
                <span>{new Date(tx.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <footer className="card">
        <p className="message">{message}</p>
      </footer>
    </main>
  );
}

export default App;
