import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "@asgardeo/auth-react";
import { api, setAuthToken } from "./api";
import Header from "./components/header/Header";
import Body from "./components/body/Body";
import Footer from "./components/footer/Footer";
import "./App.css";
import "./styles/body.css";
import "./styles/signin.css";

const tokenStorageKey = "bank_admin_token";

function App() {
  const hasAuthConfig = Boolean(
    import.meta.env.VITE_ASGARDEO_CLIENT_ID && import.meta.env.VITE_ASGARDEO_BASE_URL,
  );
  const auth = useAuthContext();
  const state = auth?.state;
  const signIn = auth?.signIn;
  const signOut = auth?.signOut;
  const getAccessToken = auth?.getAccessToken;
  const isAuthenticated = Boolean(state?.isAuthenticated);
  const isLoadingAuth = !auth || Boolean(state?.isLoading);

  const [token, setToken] = useState(localStorage.getItem(tokenStorageKey));
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("Ready");

  const [customers, setCustomers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [newCustomerName, setNewCustomerName] = useState("Jane Doe");
  const [newCustomerEmail, setNewCustomerEmail] = useState("jane.doe@bank.local");

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newAccountType, setNewAccountType] = useState("checking");

  const [transactionAccountId, setTransactionAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amount, setAmount] = useState(100);

  const canManageCustomers = useMemo(() => user?.role === "admin", [user]);
  const canPostTransactions = useMemo(
    () => user?.role === "admin" || user?.role === "teller",
    [user],
  );

  const loadCustomers = useCallback(async () => {
    const { data } = await api.get("/customers");
    setCustomers(data.items || data);
  }, []);

  const loadAccounts = useCallback(async () => {
    const { data } = await api.get("/accounts");
    setAccounts(data);
  }, []);

  const loadTransactions = useCallback(async () => {
    const { data } = await api.get("/transactions");
    const items = data.items || data;
    setTransactions(items.slice().reverse());
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      await Promise.all([loadCustomers(), loadAccounts(), loadTransactions()]);
    } catch {
      setMessage("Signed in with Asgardeo, but backend rejected current token claims.");
    }
  }, [loadAccounts, loadCustomers, loadTransactions]);

  const syncAsgardeoToken = useCallback(async () => {
    if (!isAuthenticated || typeof getAccessToken !== "function") {
      localStorage.removeItem(tokenStorageKey);
      setToken(null);
      setUser(null);
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setMessage("Unable to retrieve Asgardeo access token.");
      return;
    }

    localStorage.setItem(tokenStorageKey, accessToken);
    setToken(accessToken);
    setMessage("Signed in with Asgardeo.");
  }, [getAccessToken, isAuthenticated]);

  useEffect(() => {
    void syncAsgardeoToken();
  }, [syncAsgardeoToken]);

  useEffect(() => {
    setAuthToken(token);
    if (!token) return;
    void loadMe();
  }, [token, loadMe]);

  const onLogout = async () => {
    if (typeof signOut === "function") {
      await signOut();
    }
    localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setUser(null);
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

  if (!state || !state.isAuthenticated) {
    return (
      <main className="container">
        <section className="card signin-card login-card">
          <p className="eyebrow">Secure portal</p>
          <h1>Bank Admin Platform</h1>
          <p className="login-copy">Home page is public. Sign in with Asgardeo to access protected banking operations.</p>
          {!hasAuthConfig ? (
            <p className="login-warning">
              Asgardeo is not configured yet. Add `VITE_ASGARDEO_CLIENT_ID` and
              `VITE_ASGARDEO_BASE_URL` to `frontend/.env` so the sign-in button can open the
              provider window.
            </p>
          ) : null}
          <div className="signin-actions">
            <button className="signin-button" onClick={() => void signIn?.()} disabled={!hasAuthConfig}>
              Sign In
            </button>
          </div>
          <small className="login-footnote">
            The app expects an Asgardeo access token with admin, teller, or auditor role claims.
          </small>
          <p className="message">{message}</p>
        </section>
      </main>
    );
  }

  return (
    <>
      {isLoadingAuth ? (
        <main className="login-shell">
          <section className="card signin-card login-card">
            <p className="eyebrow">Secure portal</p>
            <h1>Bank Admin Platform</h1>
            <p className="login-copy">Loading authentication...</p>
          </section>
        </main>
      ) : !isAuthenticated ? (
        <main className="login-shell">
          <section className="card signin-card login-card">
            <p className="eyebrow">Secure portal</p>
            <h1>Bank Admin Platform</h1>
            <p className="login-copy">
              Sign in to manage customers, accounts, and transactions.
            </p>

            <div className="signin-actions">
              <button className="signin-button" onClick={() => void signIn?.()}>
                Sign In
              </button>
            </div>

            <small className="login-footnote">
              Asgardeo access is required before the banking dashboard loads.
            </small>

            <p className="message">{message}</p>
          </section>
        </main>
      ) : user ? (
          <main className="container">
            <Header user={user} onLogout={onLogout} />

            <Body
              customers={customers}
              accounts={accounts}
              transactions={transactions}
              canManageCustomers={canManageCustomers}
              canPostTransactions={canPostTransactions}
              newCustomerName={newCustomerName}
              setNewCustomerName={setNewCustomerName}
              newCustomerEmail={newCustomerEmail}
              setNewCustomerEmail={setNewCustomerEmail}
              selectedCustomerId={selectedCustomerId}
              setSelectedCustomerId={setSelectedCustomerId}
              newAccountType={newAccountType}
              setNewAccountType={setNewAccountType}
              transactionAccountId={transactionAccountId}
              setTransactionAccountId={setTransactionAccountId}
              destinationAccountId={destinationAccountId}
              setDestinationAccountId={setDestinationAccountId}
              amount={amount}
              setAmount={setAmount}
              createCustomer={createCustomer}
              createAccount={createAccount}
              postDeposit={postDeposit}
              postWithdrawal={postWithdrawal}
              postTransfer={postTransfer}
            />

            <div className="signin-actions">
              <button className="signin-button" onClick={onLogout}>
                Sign Out
              </button>
            </div>

            <Footer message={message} />
          </main>
        ) : (
          <main className="container">
            <section className="card signin-card">
              <p className="message">Loading profile from API...</p>
            </section>
          </main>
        )}
    </>
  );
}

export default App;
