import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  accountsApi,
  auditsApi,
  authApi,
  customersApi,
  getApiErrorInfo,
  setAuthToken,
  transactionsApi,
  usersApi,
  type Account,
  type Customer,
  type LoginAudit,
  type Reconciliation,
  type Role,
  type StaffUser,
  type Transaction,
} from "./api";
import "./App.css";

type ModuleKey = "users" | "customers" | "accounts" | "transactions" | "audits";

const tokenStorageKey = "bank_admin_token";

const roleModules: Record<Role, ModuleKey[]> = {
  admin: ["users", "customers", "accounts", "transactions", "audits"],
  teller: ["customers", "accounts", "transactions"],
  auditor: ["customers", "accounts", "transactions", "audits"],
  customer: ["customers", "accounts", "transactions"],
};

const moduleTitle: Record<ModuleKey, string> = {
  users: "Staff Users",
  customers: "Customers",
  accounts: "Accounts",
  transactions: "Transactions",
  audits: "Audits",
};

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem(tokenStorageKey));
  const [user, setUser] = useState<StaffUser | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleKey>("customers");

  const [email, setEmail] = useState("admin@bank.local");
  const [password, setPassword] = useState("Admin123!");
  const [message, setMessage] = useState("Ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [audits, setAudits] = useState<LoginAudit[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);

  const [userCreate, setUserCreate] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "teller" as Role,
    password: "",
  });
  const [userEditId, setUserEditId] = useState("");
  const [userEdit, setUserEdit] = useState({
    firstName: "",
    lastName: "",
    role: "teller" as Role,
  });

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerCreate, setCustomerCreate] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "1990-01-01",
    address: "",
  });
  const [customerId, setCustomerId] = useState("");
  const [customerUpdate, setCustomerUpdate] = useState({
    email: "",
    phone: "",
    address: "",
  });
  const [customerDetail, setCustomerDetail] = useState<(Customer & { accounts: Account[] }) | null>(null);
  const [customerAccounts, setCustomerAccounts] = useState<Account[]>([]);

  const [accountCreate, setAccountCreate] = useState({
    customerId: "",
    type: "checking" as "checking" | "savings",
    apy: 1,
    overdraftLimit: -250,
  });
  const [accountEdit, setAccountEdit] = useState({
    accountId: "",
    status: "active" as "active" | "frozen" | "closed",
    apy: 1,
    overdraftLimit: -250,
  });
  const [accountDetail, setAccountDetail] = useState<Account | null>(null);

  const [txFilters, setTxFilters] = useState({
    accountId: "",
    type: "",
    startDate: "",
    endDate: "",
  });
  const [txDetailId, setTxDetailId] = useState("");
  const [txDetail, setTxDetail] = useState<Transaction | null>(null);
  const [posting, setPosting] = useState({
    accountId: "",
    destinationAccountId: "",
    amount: 100,
    memo: "",
  });

  const [reconcileAccountId, setReconcileAccountId] = useState("");

  const isAdmin = user?.role === "admin";
  const canCreateCustomer = user?.role === "admin";
  const canWriteCustomers = user?.role === "admin" || user?.role === "customer";
  const canWriteAccounts = user?.role === "admin";
  const canPostTransactions =
    user?.role === "admin" || user?.role === "teller" || user?.role === "customer";
  const canReadAudit = user?.role === "admin" || user?.role === "auditor";

  const visibleModules = useMemo(() => (user ? roleModules[user.role] : []), [user]);

  useEffect(() => {
    setAuthToken(token);
    if (!token) {
      setUser(null);
      setUsers([]);
      setCustomers([]);
      setAccounts([]);
      setTransactions([]);
      setAudits([]);
      return;
    }
    void bootstrap();
  }, [token]);

  useEffect(() => {
    if (!visibleModules.includes(activeModule) && visibleModules.length > 0) {
      setActiveModule(visibleModules[0]);
    }
  }, [activeModule, visibleModules]);

  const clearSession = (reason: string) => {
    localStorage.removeItem(tokenStorageKey);
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setMessage(reason);
  };

  const withAction = async (action: string, task: () => Promise<void>, success?: string) => {
    setBusyAction(action);
    setErrorMessage(null);
    try {
      await task();
      if (success) {
        setMessage(success);
      }
    } catch (error) {
      const info = getApiErrorInfo(error);
      if (info.status === 401) {
        clearSession("Session expired. Please log in again.");
      } else {
        setErrorMessage(info.message);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const refreshData = async (role: Role, search?: string) => {
    const tasks: Promise<unknown>[] = [
      customersApi.list(search).then(setCustomers),
      accountsApi.list().then(setAccounts),
      transactionsApi.list().then(setTransactions),
    ];

    if (role === "admin") {
      tasks.push(usersApi.list().then(setUsers));
    }

    await Promise.all(tasks);
  };

  const bootstrap = async () => {
    await withAction("bootstrap", async () => {
      const profile = await authApi.me();
      setUser(profile);
      await refreshData(profile.role, customerSearch);
      setActiveModule(profile.role === "admin" ? "users" : "customers");
    });
  };

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    await withAction("login", async () => {
      const data = await authApi.login(email, password);
      localStorage.setItem(tokenStorageKey, data.accessToken);
      setToken(data.accessToken);
      setMessage("Login successful.");
    });
  };

  const onLogout = async () => {
    await withAction("logout", async () => {
      await authApi.logout();
      clearSession("Logged out.");
    });
  };

  const runSearch = async () => {
    await withAction("customers-search", async () => {
      setCustomers(await customersApi.list(customerSearch));
    });
  };

  const createUser = async () => {
    if (!isAdmin || !userCreate.firstName || !userCreate.lastName || !userCreate.email || !userCreate.password) {
      return;
    }

    await withAction("users-create", async () => {
      await usersApi.create(userCreate);
      setUsers(await usersApi.list());
      setUserCreate({ firstName: "", lastName: "", email: "", role: "teller", password: "" });
    }, "User created.");
  };

  const updateUser = async () => {
    if (!isAdmin || !userEditId) return;
    await withAction("users-update", async () => {
      await usersApi.update(userEditId, {
        firstName: userEdit.firstName || undefined,
        lastName: userEdit.lastName || undefined,
        role: userEdit.role,
      });
      setUsers(await usersApi.list());
    }, "User updated.");
  };

  const deactivateUser = async () => {
    if (!isAdmin || !userEditId) return;
    await withAction("users-delete", async () => {
      await usersApi.deactivate(userEditId);
      setUsers(await usersApi.list());
    }, "User deactivated.");
  };

  const createCustomer = async () => {
    if (!canCreateCustomer) return;
    await withAction("customers-create", async () => {
      await customersApi.create(customerCreate);
      setCustomers(await customersApi.list(customerSearch));
      setCustomerCreate({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        dateOfBirth: "1990-01-01",
        address: "",
      });
    }, "Customer created.");
  };

  const loadCustomerDetail = async () => {
    if (!customerId) return;
    await withAction("customers-detail", async () => {
      setCustomerDetail(await customersApi.getById(customerId));
    });
  };

  const loadCustomerAccounts = async () => {
    if (!customerId) return;
    await withAction("customers-accounts", async () => {
      setCustomerAccounts(await customersApi.getAccounts(customerId));
    });
  };

  const updateCustomer = async () => {
    if (!canWriteCustomers || !customerId) return;
    await withAction("customers-update", async () => {
      await customersApi.update(customerId, {
        email: customerUpdate.email || undefined,
        phone: customerUpdate.phone || undefined,
        address: customerUpdate.address || undefined,
      });
      setCustomers(await customersApi.list(customerSearch));
      setCustomerDetail(await customersApi.getById(customerId));
    }, "Customer updated.");
  };

  const deactivateCustomer = async () => {
    if (!canWriteCustomers || !customerId) return;
    await withAction("customers-delete", async () => {
      await customersApi.deactivate(customerId);
      setCustomers(await customersApi.list(customerSearch));
      setCustomerDetail(null);
      setCustomerAccounts([]);
    }, "Customer deactivated and related accounts frozen.");
  };

  const createAccount = async () => {
    if (!canWriteAccounts || !accountCreate.customerId) return;

    await withAction("accounts-create", async () => {
      await accountsApi.create({
        customerId: accountCreate.customerId,
        type: accountCreate.type,
        apy: accountCreate.type === "savings" ? accountCreate.apy : undefined,
        overdraftLimit: accountCreate.type === "checking" ? accountCreate.overdraftLimit : undefined,
      });
      setAccounts(await accountsApi.list());
    }, "Account opened.");
  };

  const loadAccountDetail = async () => {
    if (!accountEdit.accountId) return;
    await withAction("accounts-detail", async () => {
      setAccountDetail(await accountsApi.getById(accountEdit.accountId));
    });
  };

  const updateAccount = async () => {
    if (!canWriteAccounts || !accountEdit.accountId) return;

    await withAction("accounts-update", async () => {
      await accountsApi.update(accountEdit.accountId, {
        status: accountEdit.status,
        apy: accountEdit.apy,
        overdraftLimit: accountEdit.overdraftLimit,
      });
      setAccounts(await accountsApi.list());
      setAccountDetail(await accountsApi.getById(accountEdit.accountId));
    }, "Account updated.");
  };

  const loadTransactions = async () => {
    await withAction("transactions-list", async () => {
      setTransactions(
        await transactionsApi.list({
          accountId: txFilters.accountId || undefined,
          type:
            (txFilters.type as "deposit" | "withdrawal" | "transfer_out" | "transfer_in") || undefined,
          startDate: txFilters.startDate || undefined,
          endDate: txFilters.endDate || undefined,
        }),
      );
    });
  };

  const loadTransactionDetail = async () => {
    if (!txDetailId) return;
    await withAction("transactions-detail", async () => {
      setTxDetail(await transactionsApi.getById(txDetailId));
    });
  };

  const postDeposit = async () => {
    if (!canPostTransactions || !posting.accountId) return;
    await withAction("transactions-deposit", async () => {
      await transactionsApi.deposit({
        accountId: posting.accountId,
        amount: posting.amount,
        memo: posting.memo || undefined,
      });
      setAccounts(await accountsApi.list());
      await loadTransactions();
    }, "Deposit posted.");
  };

  const postWithdrawal = async () => {
    if (!canPostTransactions || !posting.accountId) return;
    await withAction("transactions-withdrawal", async () => {
      await transactionsApi.withdrawal({
        accountId: posting.accountId,
        amount: posting.amount,
        memo: posting.memo || undefined,
      });
      setAccounts(await accountsApi.list());
      await loadTransactions();
    }, "Withdrawal posted.");
  };

  const postTransfer = async () => {
    if (!canPostTransactions || !posting.accountId || !posting.destinationAccountId) return;
    await withAction("transactions-transfer", async () => {
      await transactionsApi.transfer({
        sourceAccountId: posting.accountId,
        destinationAccountId: posting.destinationAccountId,
        amount: posting.amount,
        memo: posting.memo || undefined,
      });
      setAccounts(await accountsApi.list());
      await loadTransactions();
    }, "Transfer posted.");
  };

  const loadAudits = async () => {
    if (!canReadAudit) return;
    await withAction("audits-list", async () => {
      setAudits(await auditsApi.listLoginAudits());
    });
  };

  const loadReconciliation = async () => {
    if (!canReadAudit || !reconcileAccountId) return;
    await withAction("audits-reconcile", async () => {
      setReconciliation(await auditsApi.getReconciliation(reconcileAccountId));
    });
  };

  if (!user) {
    return (
      <main className="container">
        <section className="card login-card elevated">
          <h1>Bank Admin Console</h1>
          <p>Secure staff portal with role-gated operations.</p>
          <form onSubmit={onLogin}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            <label>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
            <button type="submit" className="btn btn-primary" disabled={busyAction === "login"}>
              {busyAction === "login" ? "Signing In..." : "Log In"}
            </button>
          </form>
          <small>
            Admin: admin@bank.local / Admin123! | Teller: teller@bank.local / Teller123! | Auditor:
            auditor@bank.local / Auditor123! | Customer: demo.customer@bank.local / Customer123!
          </small>
          <p className="message ok">{message}</p>
          {errorMessage && <p className="message error">{errorMessage}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="card header-row elevated">
        <div>
          <h1>Bank Admin Console</h1>
          <p>
            Logged in as {user.firstName} {user.lastName} ({user.role})
          </p>
        </div>
        <div className="inline-fields compact">
          {visibleModules.map((module) => (
            <button
              key={module}
              onClick={() => setActiveModule(module)}
              className={`btn btn-module ${activeModule === module ? "active" : ""}`}
            >
              {moduleTitle[module]}
            </button>
          ))}
          <button onClick={onLogout} className="btn btn-danger" disabled={busyAction === "logout"}>
            Log Out
          </button>
        </div>
      </header>

      {errorMessage && (
        <section className="card">
          <p className="message error">{errorMessage}</p>
        </section>
      )}

      {activeModule === "users" && isAdmin && (
        <section className="grid two-col">
          <article className="card">
            <h2>Staff User CRUD</h2>
            <div className="inline-fields">
              <input
                placeholder="First name"
                value={userCreate.firstName}
                onChange={(e) => setUserCreate((prev) => ({ ...prev, firstName: e.target.value }))}
              />
              <input
                placeholder="Last name"
                value={userCreate.lastName}
                onChange={(e) => setUserCreate((prev) => ({ ...prev, lastName: e.target.value }))}
              />
              <input
                placeholder="Email"
                value={userCreate.email}
                onChange={(e) => setUserCreate((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                placeholder="Temporary password"
                type="password"
                value={userCreate.password}
                onChange={(e) => setUserCreate((prev) => ({ ...prev, password: e.target.value }))}
              />
              <select
                value={userCreate.role}
                onChange={(e) => setUserCreate((prev) => ({ ...prev, role: e.target.value as Role }))}
              >
                <option value="admin">admin</option>
                <option value="teller">teller</option>
                <option value="auditor">auditor</option>
              </select>
              <button className="btn btn-create" onClick={createUser} disabled={busyAction === "users-create"}>
                Create User
              </button>
            </div>

            <div className="inline-fields">
              <select value={userEditId} onChange={(e) => setUserEditId(e.target.value)}>
                <option value="">Select user to edit</option>
                {users.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.firstName} {staff.lastName}
                  </option>
                ))}
              </select>
              <input
                placeholder="New first name"
                value={userEdit.firstName}
                onChange={(e) => setUserEdit((prev) => ({ ...prev, firstName: e.target.value }))}
              />
              <input
                placeholder="New last name"
                value={userEdit.lastName}
                onChange={(e) => setUserEdit((prev) => ({ ...prev, lastName: e.target.value }))}
              />
              <select
                value={userEdit.role}
                onChange={(e) => setUserEdit((prev) => ({ ...prev, role: e.target.value as Role }))}
              >
                <option value="admin">admin</option>
                <option value="teller">teller</option>
                <option value="auditor">auditor</option>
              </select>
              <button className="btn btn-update" onClick={updateUser} disabled={busyAction === "users-update"}>
                Update User
              </button>
              <button className="btn btn-danger" onClick={deactivateUser} disabled={busyAction === "users-delete"}>
                Deactivate User
              </button>
            </div>
          </article>

          <article className="card">
            <h2>Staff Directory</h2>
            <button
              className="btn btn-info"
              onClick={() => withAction("users-list", async () => setUsers(await usersApi.list()))}
              disabled={busyAction === "users-list"}
            >
              Refresh Users
            </button>
            <ul className="list">
              {users.map((staff) => (
                <li key={staff.id}>
                  <strong>
                    {staff.firstName} {staff.lastName}
                  </strong>
                  <span>{staff.email}</span>
                  <span>{staff.role}</span>
                  <span>{staff.isActive ? "active" : "inactive"}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}

      {activeModule === "customers" && (
        <section className="grid two-col">
          <article className="card">
            <h2>Customer Directory</h2>
            <div className="inline-fields">
              <input
                placeholder="Search by name or email"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <button className="btn btn-info" onClick={runSearch} disabled={busyAction === "customers-search"}>
                Search
              </button>
            </div>

            {canCreateCustomer && (
              <div className="inline-fields">
                <input
                  placeholder="First name"
                  value={customerCreate.firstName}
                  onChange={(e) => setCustomerCreate((prev) => ({ ...prev, firstName: e.target.value }))}
                />
                <input
                  placeholder="Last name"
                  value={customerCreate.lastName}
                  onChange={(e) => setCustomerCreate((prev) => ({ ...prev, lastName: e.target.value }))}
                />
                <input
                  placeholder="Email"
                  value={customerCreate.email}
                  onChange={(e) => setCustomerCreate((prev) => ({ ...prev, email: e.target.value }))}
                />
                <input
                  placeholder="Phone"
                  value={customerCreate.phone}
                  onChange={(e) => setCustomerCreate((prev) => ({ ...prev, phone: e.target.value }))}
                />
                <input
                  type="date"
                  value={customerCreate.dateOfBirth}
                  onChange={(e) => setCustomerCreate((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                />
                <input
                  placeholder="Address"
                  value={customerCreate.address}
                  onChange={(e) => setCustomerCreate((prev) => ({ ...prev, address: e.target.value }))}
                />
                <button className="btn btn-create" onClick={createCustomer} disabled={busyAction === "customers-create"}>
                  Create Customer
                </button>
              </div>
            )}

            <ul className="list">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <strong>
                    {customer.firstName} {customer.lastName}
                  </strong>
                  <span>{customer.email}</span>
                  <span>{customer.isActive ? "active" : "inactive"}</span>
                  <span>ID: {customer.id}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h2>Customer Detail and Actions</h2>
            <div className="inline-fields">
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.firstName} {customer.lastName}
                  </option>
                ))}
              </select>
              <button className="btn btn-info" onClick={loadCustomerDetail} disabled={busyAction === "customers-detail"}>
                Load Detail
              </button>
              <button
                className="btn btn-secondary"
                onClick={loadCustomerAccounts}
                disabled={busyAction === "customers-accounts"}
              >
                Load Accounts
              </button>
            </div>

            {canWriteCustomers && (
              <div className="inline-fields">
                <input
                  placeholder="Update email"
                  value={customerUpdate.email}
                  onChange={(e) => setCustomerUpdate((prev) => ({ ...prev, email: e.target.value }))}
                />
                <input
                  placeholder="Update phone"
                  value={customerUpdate.phone}
                  onChange={(e) => setCustomerUpdate((prev) => ({ ...prev, phone: e.target.value }))}
                />
                <input
                  placeholder="Update address"
                  value={customerUpdate.address}
                  onChange={(e) => setCustomerUpdate((prev) => ({ ...prev, address: e.target.value }))}
                />
                <button className="btn btn-update" onClick={updateCustomer} disabled={busyAction === "customers-update"}>
                  Update Customer
                </button>
                <button className="btn btn-danger" onClick={deactivateCustomer} disabled={busyAction === "customers-delete"}>
                  Deactivate Customer
                </button>
              </div>
            )}

            {customerDetail && (
              <div className="details-box">
                <p>
                  <strong>Customer:</strong> {customerDetail.firstName} {customerDetail.lastName}
                </p>
                <p>
                  <strong>Email:</strong> {customerDetail.email}
                </p>
                <p>
                  <strong>Phone:</strong> {customerDetail.phone}
                </p>
                <p>
                  <strong>Address:</strong> {customerDetail.address}
                </p>
              </div>
            )}

            <ul className="list">
              {customerAccounts.map((account) => (
                <li key={account.id}>
                  <strong>{account.type}</strong>
                  <span>{account.maskedAccountNumber || account.accountNumber}</span>
                  <span>Status: {account.status}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>
      )}

      {activeModule === "accounts" && (
        <section className="grid two-col">
          <article className="card">
            <h2>Account Registry</h2>
            {canWriteAccounts && (
              <div className="inline-fields">
                <select
                  value={accountCreate.customerId}
                  onChange={(e) => setAccountCreate((prev) => ({ ...prev, customerId: e.target.value }))}
                >
                  <option value="">Select customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.firstName} {customer.lastName}
                    </option>
                  ))}
                </select>
                <select
                  value={accountCreate.type}
                  onChange={(e) =>
                    setAccountCreate((prev) => ({ ...prev, type: e.target.value as "checking" | "savings" }))
                  }
                >
                  <option value="checking">checking</option>
                  <option value="savings">savings</option>
                </select>
                {accountCreate.type === "savings" ? (
                  <input
                    type="number"
                    step={0.01}
                    value={accountCreate.apy}
                    onChange={(e) => setAccountCreate((prev) => ({ ...prev, apy: Number(e.target.value) }))}
                    placeholder="APY"
                  />
                ) : (
                  <input
                    type="number"
                    step={0.01}
                    value={accountCreate.overdraftLimit}
                    onChange={(e) =>
                      setAccountCreate((prev) => ({ ...prev, overdraftLimit: Number(e.target.value) }))
                    }
                    placeholder="Overdraft limit"
                  />
                )}
                <button className="btn btn-create" onClick={createAccount} disabled={busyAction === "accounts-create"}>
                  Open Account
                </button>
              </div>
            )}

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
            <h2>Account Lifecycle</h2>
            <div className="inline-fields">
              <select
                value={accountEdit.accountId}
                onChange={(e) => setAccountEdit((prev) => ({ ...prev, accountId: e.target.value }))}
              >
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.maskedAccountNumber || account.accountNumber}
                  </option>
                ))}
              </select>
              <button className="btn btn-info" onClick={loadAccountDetail} disabled={busyAction === "accounts-detail"}>
                Load Detail
              </button>
            </div>

            {canWriteAccounts && (
              <div className="inline-fields">
                <select
                  value={accountEdit.status}
                  onChange={(e) =>
                    setAccountEdit((prev) => ({ ...prev, status: e.target.value as "active" | "frozen" | "closed" }))
                  }
                >
                  <option value="active">active</option>
                  <option value="frozen">frozen</option>
                  <option value="closed">closed</option>
                </select>
                <input
                  type="number"
                  step={0.01}
                  value={accountEdit.apy}
                  onChange={(e) => setAccountEdit((prev) => ({ ...prev, apy: Number(e.target.value) }))}
                  placeholder="APY"
                />
                <input
                  type="number"
                  step={0.01}
                  value={accountEdit.overdraftLimit}
                  onChange={(e) => setAccountEdit((prev) => ({ ...prev, overdraftLimit: Number(e.target.value) }))}
                  placeholder="Overdraft limit"
                />
                <button className="btn btn-update" onClick={updateAccount} disabled={busyAction === "accounts-update"}>
                  Update Account
                </button>
              </div>
            )}

            {accountDetail && (
              <div className="details-box">
                <p>
                  <strong>Account:</strong> {accountDetail.maskedAccountNumber || accountDetail.accountNumber}
                </p>
                <p>
                  <strong>Status:</strong> {accountDetail.status}
                </p>
                <p>
                  <strong>Balance:</strong> ${accountDetail.balance.toFixed(2)}
                </p>
                <p>
                  <strong>APY:</strong> {accountDetail.apy}%
                </p>
                <p>
                  <strong>Overdraft:</strong> ${accountDetail.overdraftLimit.toFixed(2)}
                </p>
              </div>
            )}
          </article>
        </section>
      )}

      {activeModule === "transactions" && (
        <section className="grid two-col">
          <article className="card">
            <h2>History and Filters</h2>
            <div className="inline-fields">
              <select
                value={txFilters.accountId}
                onChange={(e) => setTxFilters((prev) => ({ ...prev, accountId: e.target.value }))}
              >
                <option value="">All accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.maskedAccountNumber || account.accountNumber}
                  </option>
                ))}
              </select>
              <select
                value={txFilters.type}
                onChange={(e) => setTxFilters((prev) => ({ ...prev, type: e.target.value }))}
              >
                <option value="">All types</option>
                <option value="deposit">deposit</option>
                <option value="withdrawal">withdrawal</option>
                <option value="transfer_out">transfer_out</option>
                <option value="transfer_in">transfer_in</option>
              </select>
              <input
                type="date"
                value={txFilters.startDate}
                onChange={(e) => setTxFilters((prev) => ({ ...prev, startDate: e.target.value }))}
              />
              <input
                type="date"
                value={txFilters.endDate}
                onChange={(e) => setTxFilters((prev) => ({ ...prev, endDate: e.target.value }))}
              />
              <button className="btn btn-info" onClick={loadTransactions} disabled={busyAction === "transactions-list"}>
                Load History
              </button>
            </div>

            <div className="inline-fields">
              <input
                placeholder="Transaction ID"
                value={txDetailId}
                onChange={(e) => setTxDetailId(e.target.value)}
              />
              <button
                className="btn btn-secondary"
                onClick={loadTransactionDetail}
                disabled={busyAction === "transactions-detail"}
              >
                Fetch Transaction
              </button>
            </div>

            {txDetail && (
              <div className="details-box">
                <p>
                  <strong>Transaction:</strong> {txDetail.id}
                </p>
                <p>
                  <strong>Type:</strong> {txDetail.type}
                </p>
                <p>
                  <strong>Amount:</strong> ${txDetail.amount.toFixed(2)}
                </p>
                <p>
                  <strong>Balance After:</strong> ${txDetail.balanceAfter.toFixed(2)}
                </p>
              </div>
            )}

            <ul className="list">
              {transactions.map((tx) => (
                <li key={tx.id}>
                  <strong>{tx.type}</strong>
                  <span>ID: {tx.id}</span>
                  <span>${tx.amount.toFixed(2)}</span>
                  <span>balance ${tx.balanceAfter.toFixed(2)}</span>
                  <span>{new Date(tx.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h2>Posting Controls</h2>
            {!canPostTransactions && (
              <p className="message muted">Read-only role. Posting controls are hidden for auditors.</p>
            )}

            {canPostTransactions && (
              <>
                <div className="inline-fields">
                  <select
                    value={posting.accountId}
                    onChange={(e) => setPosting((prev) => ({ ...prev, accountId: e.target.value }))}
                  >
                    <option value="">Source account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.maskedAccountNumber || account.accountNumber}
                      </option>
                    ))}
                  </select>
                  <select
                    value={posting.destinationAccountId}
                    onChange={(e) => setPosting((prev) => ({ ...prev, destinationAccountId: e.target.value }))}
                  >
                    <option value="">Destination for transfer</option>
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
                    value={posting.amount}
                    onChange={(e) => setPosting((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                  />
                  <input
                    placeholder="Memo"
                    value={posting.memo}
                    onChange={(e) => setPosting((prev) => ({ ...prev, memo: e.target.value }))}
                  />
                </div>
                <div className="inline-fields compact">
                  <button
                    className="btn btn-create"
                    onClick={postDeposit}
                    disabled={busyAction === "transactions-deposit"}
                  >
                    Deposit
                  </button>
                  <button
                    className="btn btn-update"
                    onClick={postWithdrawal}
                    disabled={busyAction === "transactions-withdrawal"}
                  >
                    Withdraw
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={postTransfer}
                    disabled={busyAction === "transactions-transfer"}
                  >
                    Transfer
                  </button>
                </div>
              </>
            )}
          </article>
        </section>
      )}

      {activeModule === "audits" && canReadAudit && (
        <section className="grid two-col">
          <article className="card">
            <h2>Login Audit Trail</h2>
            <button className="btn btn-info" onClick={loadAudits} disabled={busyAction === "audits-list"}>
              Load Login Audits
            </button>
            <ul className="list">
              {audits.map((audit, index) => (
                <li key={`${audit.email}-${audit.timestamp}-${index}`}>
                  <strong>{audit.email}</strong>
                  <span>{audit.success ? "success" : "failed"}</span>
                  <span>{audit.ip}</span>
                  <span>{new Date(audit.timestamp).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="card">
            <h2>Reconciliation Checker</h2>
            <div className="inline-fields">
              <select value={reconcileAccountId} onChange={(e) => setReconcileAccountId(e.target.value)}>
                <option value="">Select account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.maskedAccountNumber || account.accountNumber}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                onClick={loadReconciliation}
                disabled={busyAction === "audits-reconcile"}
              >
                Run Reconciliation
              </button>
            </div>

            {reconciliation && (
              <div className="details-box">
                <p>
                  <strong>Account ID:</strong> {reconciliation.accountId}
                </p>
                <p>
                  <strong>Account Balance:</strong> ${reconciliation.accountBalance.toFixed(2)}
                </p>
                <p>
                  <strong>Net Transactions:</strong> ${reconciliation.netTransactions.toFixed(2)}
                </p>
              </div>
            )}
          </article>
        </section>
      )}

      <footer className="card">
        <p className="message ok">{message}</p>
      </footer>
    </main>
  );
}

export default App;
