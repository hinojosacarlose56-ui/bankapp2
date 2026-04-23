plan iii 

Now that we have a functional app, we need to reorganize the structure to fit that of the provided project file 

Act as a master developer in node, express, json, and react.
Fulfill the requirements of this plan, with these entities being represented WITH CURRENT ENV file variables. 
---------------------------

DESIGN CONSTRAINTS:

Carlos Hinojosa, Zijue Xu


Overall problem or description of solution:
This is a web-based banking administration platform that gives bank staff a centralized interface for managing customer accounts, processing financial transactions, and maintaining a complete, immutable audit trail of all account activity. The application solves the problem of fragmented, manual bank operations by providing a structured system for opening and managing checking and savings accounts, posting deposits, withdrawals, and transfers, and viewing real-time transaction histories per account. The MVP is scoped to core account management and transactional operations for bank staff.

Users:
Bank Admin: Full access: create and manage customer profiles, open and close accounts, post all transaction types, manage staff users and roles, view all data, and update settings such as interest rates and overdraft limits.
Bank Teller: Operational access: post deposits, withdrawals, and transfers on existing accounts; view account balances and transaction history. Cannot open or close accounts, manage customers, or access staff administration.
Auditor (read-only): View-only access to all accounts and the full transaction history for compliance and regulatory audit purposes. Cannot post transactions or modify any data.
Customer: End-user whose accounts and transactions are managed within the system. Does not log in to this admin application, the customer self-service portal is out of scope for Phase 1.

Finalized ERD


General Requirements:
	
Functional Requirements
Authentication & session management
Any staff user (admin, teller, auditor) can log in using their email address and password; the system returns a signed JWT access token on success 
The system rejects login attempts with invalid credentials and returns a generic error message that does not reveal whether the email or password was incorrect 
All login attempts, both successful and failed, are recorded with the timestamp, user email, and IP address for security auditing
Staff users can log out, which invalidates their current session token 
Role-based access is enforced on every protected API route; a teller cannot access admin-only endpoints even with a valid token
Authentication & session management
Admin can create a new staff account with first name, last name, email, and assigned role (admin/ teller / auditor) 
Admin can view a list of all staff users and see their role and active status 
Admin can update a staff member's role or profile details
Admin can deactivate a staff account, immediately preventing that user from logging in
Customer management 
Admin can create a new customer record with: first name, last name, email address, phone number, date of birth, and mailing address 
Admin and teller can search for customers by name or email address and view a paginated list of results
Admin and teller can view a customer's profile and a list of all their accounts with current balances 
Admin can edit a customer's contact information and address 
Admin can deactivate a customer record; all accounts belonging to that customer are automatically set to frozen status
Customer management 
Admin can open a new checking or savings account for any existing active customer 
The system automatically generates a unique account number when a new account is created; the number is never reused 
Admin and teller can view full account details: account type, masked account number, routing number, current balance, status, interest rate (savings), and overdraft limit (checking) 
Admin can update an account's status: freeze (blocks new transactions), unfreeze (restores active status), or close (permanent; sets closed_at timestamp) 
Admin can update the annual percentage yield (APY) interest rate on a savings account 
Admin can set or update the overdraft limit on a checking account, defining how far below $0.00 the balance is permitted to go 
A customer may hold any number of checking accounts and any number of savings accounts simultaneously
Transactions cannot be posted against a frozen or closed account; the system returns a descriptive error
Transactions: deposits 
Admin or teller can post a deposit to any active account by specifying an amount and an optional memo/description 
The system credits the specified amount to the account balance and records a transaction of type deposit 
Deposit amount must be greater than $0.00; the system rejects zero or negative deposit values
Transactions: withdrawals
Admin or teller can post a withdrawal from any active account by specifying an amount and an optional memo
The system debits the specified amount from the account balance and records a transaction of type withdrawal 
The system rejects a withdrawal if the resulting balance would fall below the account's configured overdraft limit 
Withdrawal amount must be greater than $0.00
Transactions: transfers 
Admin or teller can post a transfer by specifying a source account, a destination account, an amount, and an optional memo
The system creates two transaction records: a transfer_out on the source account and a transfer_in on the destination account; both records share the same amount, and each stores its own balance_after 
The system rejects the transfer if the source account's balance minus the transfer amount would fall below its overdraft limit 
If either side of the transfer fails (destination account is frozen), neither transaction is committed, and no balances are changed
Transfers may be made between any two active accounts in the system, including accounts belonging to different customers
Transaction records & history 
Every transaction record stores: account_id, transaction type, amount, balance_after (snapshot), description/memo, posted_by (staff user ID), and an immutable created_at timestamp 
Transactions are immutable once posted; no edit or delete operations exist; corrections are made by posting a new offsetting transaction
Admin and teller can view a paginated transaction history for any account, filterable by transaction type and date range 
An auditor can view all accounts and all transaction history across all accounts in read-only mode; an auditor cannot post, edit, or delete anything



Non-Functional Requirements
Security 
All API routes except /auth/login require a valid signed JWT; requests without a token or with an expired token receive HTTP 401 
User passwords are never stored in plaintext; they are hashed using bcrypt with a minimum cost factor of 12 
 All data in transit is encrypted via HTTPS/TLS in production; plain HTTP requests are redirected to HTTPS 
JWT tokens expire after 8 hours; clients must re-authenticate after expiry 
Role permissions are enforced server-side on every request; the frontend role check is for UX only and is not trusted as authorization
Data integrity & financial precision 
All monetary values are stored as DECIMAL(15,2) in the database, never as floating-point types, to eliminate rounding errors 
An account's current balance must always equal the net sum of all its posted transactions; the balance_after field on each transaction enables row-by-row reconciliation
Transfer operations execute inside a single database transaction (ACID); if any part fails, the entire operation is rolled back, and neither account balance is changed 
Transaction records are append-only; no UPDATE or DELETE operations are permitted on the TRANSACTION table after a record is created
Performance 
Account balance lookups and single-account transaction list queries must return a response within 300ms at p95 under normal load 
Dashboard summary statistics (KPIs) may use cached values with a maximum staleness of 60 seconds to avoid expensive aggregation queries on every page load 
Paginated list endpoints (customers, accounts, transactions) must return within 500ms for pages of up to 50 records
Availability & reliability 
The application targets 99.9% uptime (fewer than ~9 hours of unplanned downtime per year) 
Deployments must be zero-downtime (rolling deploys); a new release must not drop active in-flight requests 
The database must have automated daily backups with a minimum 30-day retention period

Routes List

Authentication 
Post     /api/auth/login
Post     /api/auth/logout
Get      /api/auth/me
Staff Users
Get      /api/users
Post       /api/users
get         /api/users/id
Put        /api/users/id
Delete   /api/users/id
Customers
Get     /api/customers
Post     /api/customers
Get    /api/customers/id
Put      /api/customers/id
Delete    /api/customers/id
Get     /api/customers/id/accounts
Accounts
Get      /api/accounts
Post     /api/accounts
Get       /api/accounts/id
Put       /api/accounts/id
Get      /api/accounts/transactions
Transactions
Get      /api/transactions
Post     /api/transactions/deposit
Post     /api/transactions/withdrawal
Post      /api/transactions/transfer
Get      /api/transactions/id

Tech Stack

Frontend 
React 18 - UI framework 
Vite - build tool and dev server 
TypeScript - type safety across the codebase 
Tailwind CSS - utility-first styling 
shadcn/ui - accessible, pre-built component library 
TanStack Query (React Query) - server-state caching and data fetching 
React Router v6 - client-side routing 

Backend
CORS FOR DOMAIN ACCESSES
AND AXIOS
Node.js - runtime environment 
Express.js - REST API framework 
Zod - schema validation for all API inputs 
JSON Web Tokens (jsonwebtoken) - stateless auth tokens USING ASGARDEO
bcrypt - password hashing (cost factor 12) 
Database 
PostgreSQL 16 - primary relational database 
Hosting & Infrastructure 
Render - frontend hosting, CDN, branch preview environments 
Railway - backend API and PostgreSQL database hosting 
GitHub Actions - CI/CD pipeline (lint, type-check, test, auto-deploy) 
Splash Page 
Static HTML/CSS hosted on Render at the project subdomain

UI Mockup




Splash Page Link
https://splash-page-4uwj.onrender.com 


----------------------------------------------------------------------

This needs to have a structure that is native to our experience. This will allow for better code maintenance and life cycle management.

This means I want the code in the following backend structure

- node_modules
- scripts
- env
- gitignore
-package-lock.json
- package.json
- server.js  --> this will host all of the validation, middleware and other server commands, including api route
--------------------------------------------------------
And a  frontend structure consistent with this in react. 

- node_modules
- src
	- components
		-body
		-footer
		-header
 		-App.css
		-App.jsx
		-index.css
		-main.jsx

	- styles
		-body.css
		-footer.css
		-header.css
		-signin.css

-env
-gitignore
-eslint.config.js
-index.html
-package-lock.json
-package.json
-vite.config.js

----------------------------------------------------------
key information: 
- this needs to be using Asgardeo for JWT authentication, this should tie into the frontend and backend pages, with a home page being visible without being logged in, with a prompt for the users to login using their credentials. 

- Reference the project that I provided as a resource to view how we want the JWTs, bearers, and authorization tasks to be structured. THIS IS KEY IN ORDER TO ENSURE THAT THE DEVS CAN DEBUG AND UNDERSTAND THE CODE WITH THEIR EXPERIENCE. FOLLOW THIS GUIDE TO THE LETTER, AND IF THERE ARE QUESTIONS ON PREFERENCE, ASK THE DEVS BEFORE MAKING ASSUMPTIONS. WE ARE HAPPY TO HELP:)