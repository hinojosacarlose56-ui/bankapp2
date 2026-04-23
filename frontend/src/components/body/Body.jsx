import "../../styles/body.css";

function Body({
  customers,
  accounts,
  transactions,
  canManageCustomers,
  canPostTransactions,
  newCustomerName,
  setNewCustomerName,
  newCustomerEmail,
  setNewCustomerEmail,
  selectedCustomerId,
  setSelectedCustomerId,
  newAccountType,
  setNewAccountType,
  transactionAccountId,
  setTransactionAccountId,
  destinationAccountId,
  setDestinationAccountId,
  amount,
  setAmount,
  createCustomer,
  createAccount,
  postDeposit,
  postWithdrawal,
  postTransfer,
}) {
  return (
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
              <strong>
                {customer.firstName} {customer.lastName}
              </strong>
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

          <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value)}>
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
              <span>${Number(account.balance).toFixed(2)}</span>
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
          <button onClick={postDeposit} disabled={!canPostTransactions}>
            Deposit
          </button>
          <button onClick={postWithdrawal} disabled={!canPostTransactions}>
            Withdraw
          </button>
          <button onClick={postTransfer} disabled={!canPostTransactions}>
            Transfer
          </button>
        </div>

        <ul className="list">
          {transactions.slice(0, 12).map((tx) => (
            <li key={tx.id}>
              <strong>{tx.type}</strong>
              <span>${Number(tx.amount).toFixed(2)}</span>
              <span>balance ${Number(tx.balanceAfter).toFixed(2)}</span>
              <span>{new Date(tx.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

export default Body;
