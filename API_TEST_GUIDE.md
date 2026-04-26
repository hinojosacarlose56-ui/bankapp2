# Bank Admin Backend - API Testing Guide

## Server Status
✅ Backend is running on `http://localhost:4000`

---

## 1. Health Check
**Verify the server is running**

```bash
curl -X GET http://localhost:4000/api/health
```

**Expected Response:**
```json
{
  "ok": true,
  "service": "bank-admin-backend"
}
```

---

## 2. Authentication - Login

### Login as Admin
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@bank.local",
    "password": "Admin123!"
  }'
```

### Login as Teller
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teller@bank.local",
    "password": "Teller123!"
  }'
```

### Login as Auditor
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "auditor@bank.local",
    "password": "Auditor123!"
  }'
```

**Response (save the accessToken for other requests):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "u_admin",
    "firstName": "System",
    "lastName": "Admin",
    "email": "admin@bank.local",
    "role": "admin",
    "isActive": true
  }
}
```

> **Note:** Save this `accessToken` - you'll need it for all authenticated requests below!

---

## 3. User Management (Admin Only)

### Get Current User Info
```bash
curl -X GET http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get All Users
```bash
curl -X GET http://localhost:4000/api/users \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Specific User
```bash
curl -X GET http://localhost:4000/api/users/u_admin \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create New User
```bash
curl -X POST http://localhost:4000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@bank.local",
    "role": "teller",
    "password": "SecurePass123!"
  }'
```

### Update User
```bash
curl -X PUT http://localhost:4000/api/users/u_teller \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "firstName": "UpdatedFirstName",
    "role": "auditor",
    "isActive": true
  }'
```

### Deactivate User
```bash
curl -X DELETE http://localhost:4000/api/users/u_teller \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 4. Customer Management

### Get All Customers (with pagination)
```bash
curl -X GET "http://localhost:4000/api/customers?page=1&pageSize=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Search Customers
```bash
curl -X GET "http://localhost:4000/api/customers?search=Demo" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Customer Details
```bash
curl -X GET http://localhost:4000/api/customers/c_demo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Customer (Admin Only)
```bash
curl -X POST http://localhost:4000/api/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@example.com",
    "phone": "555-123-4567",
    "dateOfBirth": "1985-06-15",
    "address": "456 Oak Ave, Somewhere, CA 90210"
  }'
```

### Update Customer (Admin Only)
```bash
curl -X PUT http://localhost:4000/api/customers/c_demo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "email": "newemail@example.com",
    "phone": "555-999-8888",
    "address": "789 Pine St, Anywhere, NY 10001"
  }'
```

### Deactivate Customer (Admin Only)
```bash
curl -X DELETE http://localhost:4000/api/customers/c_demo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 5. Account Management

### Get All Accounts
```bash
curl -X GET http://localhost:4000/api/accounts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Customer Accounts
```bash
curl -X GET http://localhost:4000/api/customers/c_demo/accounts \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Account Details
```bash
curl -X GET http://localhost:4000/api/accounts/a_demo_check \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Account (Admin Only)
```bash
curl -X POST http://localhost:4000/api/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "customerId": "c_demo",
    "type": "savings",
    "apy": 2.5,
    "overdraftLimit": 0
  }'
```

### Update Account (Admin Only)
```bash
curl -X PUT http://localhost:4000/api/accounts/a_demo_check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "apy": 0.5,
    "overdraftLimit": -500
  }'
```

### Freeze Account
```bash
curl -X PUT http://localhost:4000/api/accounts/a_demo_check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "frozen"
  }'
```

### Close Account
```bash
curl -X PUT http://localhost:4000/api/accounts/a_demo_check \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "status": "closed"
  }'
```

---

## 6. Transactions

### Get All Transactions
```bash
curl -X GET http://localhost:4000/api/transactions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Account Transactions
```bash
curl -X GET "http://localhost:4000/api/transactions?accountId=a_demo_check" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Filter Transactions by Type
```bash
curl -X GET "http://localhost:4000/api/transactions?type=deposit" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Filter Transactions by Date Range
```bash
curl -X GET "http://localhost:4000/api/transactions?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Transaction Details
```bash
curl -X GET http://localhost:4000/api/transactions/txn_id_here \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 7. Money Transfers

### Deposit Money (Teller or Admin Only)
```bash
curl -X POST http://localhost:4000/api/transactions/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "accountId": "a_demo_check",
    "amount": 500.00,
    "memo": "Customer deposit"
  }'
```

### Withdraw Money (Teller or Admin Only)
```bash
curl -X POST http://localhost:4000/api/transactions/withdrawal \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "accountId": "a_demo_check",
    "amount": 100.00,
    "memo": "ATM withdrawal"
  }'
```

### Transfer Between Accounts (Teller or Admin Only)
```bash
curl -X POST http://localhost:4000/api/transactions/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "sourceAccountId": "a_demo_check",
    "destinationAccountId": "a_demo_save",
    "amount": 250.00,
    "memo": "Transfer to savings"
  }'
```

---

## 8. Audit & Security

### Get Login Audits (Admin/Auditor Only)
```bash
curl -X GET http://localhost:4000/api/audits/login \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Account Reconciliation (Admin/Auditor Only)
```bash
curl -X GET http://localhost:4000/api/debug/reconciliation/a_demo_check \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Logout
```bash
curl -X POST http://localhost:4000/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Quick Test Script

Save this as `test-api.sh` and run it:

```bash
#!/bin/bash

BASE_URL="http://localhost:4000"

echo "=== Testing Bank Admin Backend API ==="
echo ""

# 1. Health Check
echo "1. Testing Health Check..."
curl -s -X GET "$BASE_URL/api/health" | jq .
echo ""

# 2. Login
echo "2. Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@bank.local", "password": "Admin123!"}')
echo "$LOGIN_RESPONSE" | jq .
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')
echo "Access Token: $TOKEN"
echo ""

# 3. Get Current User
echo "3. Testing Get Current User..."
curl -s -X GET "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo ""

# 4. Get Customers
echo "4. Testing Get Customers..."
curl -s -X GET "$BASE_URL/api/customers" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo ""

# 5. Get Accounts
echo "5. Testing Get Accounts..."
curl -s -X GET "$BASE_URL/api/accounts" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo ""

# 6. Get Transactions
echo "6. Testing Get Transactions..."
curl -s -X GET "$BASE_URL/api/transactions" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo ""

echo "=== All tests completed ==="
```

---

## Common Issues & Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Make sure backend is running: `npm run dev` in the backend folder |
| 401 Unauthorized | Add valid Bearer token to Authorization header |
| 403 Forbidden | Your role doesn't have permission for this endpoint |
| Invalid credentials | Check email and password match the staff users list |
| Account not found | Use correct account ID (e.g., `a_demo_check`) |
| Overdraft limit exceeded | Amount exceeds allowed overdraft |

---

## Test Data Available

**Staff Users:**
- Admin: `admin@bank.local` / `Admin123!`
- Teller: `teller@bank.local` / `Teller123!`
- Auditor: `auditor@bank.local` / `Auditor123!`

**Demo Customer:**
- ID: `c_demo`
- Name: Demo Customer

**Demo Accounts:**
- Checking: `a_demo_check` (Balance: $1,000)
- Savings: `a_demo_save` (Balance: $5,000)
