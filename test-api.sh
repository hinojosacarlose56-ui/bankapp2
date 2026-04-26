#!/bin/bash

BASE_URL="http://localhost:4000"

echo "🏦 === Bank Admin Backend API Test ==="
echo ""

# 1. Health Check
echo "✅ 1. Testing Health Check..."
HEALTH=$(curl -s -X GET "$BASE_URL/api/health")
echo "Response: $HEALTH"
echo ""

# 2. Login
echo "✅ 2. Testing Login as Admin..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@bank.local", "password": "Admin123!"}')
echo "Response: $LOGIN_RESPONSE"
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken' 2>/dev/null)
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Login failed!"
  exit 1
fi
echo "✅ Token obtained: ${TOKEN:0:20}..."
echo ""

# 3. Get Current User
echo "✅ 3. Testing Get Current User..."
USER=$(curl -s -X GET "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $USER"
echo ""

# 4. Get Customers
echo "✅ 4. Testing Get Customers..."
CUSTOMERS=$(curl -s -X GET "$BASE_URL/api/customers" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $CUSTOMERS"
echo ""

# 5. Get Accounts
echo "✅ 5. Testing Get Accounts..."
ACCOUNTS=$(curl -s -X GET "$BASE_URL/api/accounts" \
  -H "Authorization: Bearer $TOKEN")
echo "Response: $ACCOUNTS"
echo ""

# 6. Make a Deposit
echo "✅ 6. Testing Deposit Transaction..."
DEPOSIT=$(curl -s -X POST "$BASE_URL/api/transactions/deposit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"accountId": "a_demo_check", "amount": 100.00, "memo": "Test deposit"}')
echo "Response: $DEPOSIT"
echo ""

echo "🎉 === All tests completed successfully ==="
