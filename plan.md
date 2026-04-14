## Plan: Model-Agnostic Agent Execution Plan (Bootstrap to MVP)

This plan is updated so any agentic model can pick up work and continue reliably without losing context. It uses one monorepo with two directories, strict execution artifacts, and phase gates.

Project structure (fixed)
1. frontend - Vite + React + TypeScript app.
2. backend - Node + Express + TypeScript API.

Core stack rules (fixed)
1. Frontend route/API management uses Axios through a centralized client layer.
2. Backend scaffolding uses Express.
3. Domain permissions use CORS middleware with explicit allowed origins.
4. Database is PostgreSQL with DECIMAL(15,2) for all money values.

Product scope (fixed from prompt)
1. Included in MVP: staff auth, RBAC (admin, teller, auditor), customers, accounts, transactions (deposit, withdrawal, transfer), immutable transaction history, audit trail.
2. Excluded in MVP: customer self-service portal and customer login.

## Execution Protocol for Any Model

Single source of truth artifacts (required)
1. /memories/session/plan.md - canonical roadmap and status.
2. Board tickets with deterministic acceptance criteria.
3. API contract changelog for request/response/error updates.
4. Daily status log entries in board comments.

Model-switch handoff rules (required)
1. Never rely on chat history only; rely on plan, board status, and acceptance criteria.
2. Before starting a ticket, agent must read current plan and ticket dependency state.
3. Agent updates ticket status only when validation evidence exists.
4. Human approval required for auth logic, money movement logic, and production deployment.

Ticket execution template (required for all models)
1. Goal: one concrete outcome.
2. Inputs: required files/dependencies.
3. Tasks: exact build steps.
4. Outputs: expected artifacts.
5. Validation: commands and pass criteria.
6. Handoff: which ticket is unblocked.

## Phase 0: Bootstrap Gate (Days 1-4)

Step 1. Initialize monorepo layout with frontend and backend directories.
- Depends on: none.
- Outputs: root structure and baseline repo standards.

Step 2. Scaffold frontend in frontend with Vite React TypeScript and Axios client module.
- Depends on: Step 1.
- Outputs: runnable frontend and centralized Axios API client.

Step 3. Scaffold backend in backend with Node Express TypeScript and health endpoint.
- Depends on: Step 1.
- Outputs: runnable backend API.

Step 4. Configure CORS policy for allowed frontend origin(s).
- Depends on: Step 3.
- Outputs: explicit CORS middleware and environment-based origin allowlist.

Step 5. Add baseline quality checks and CI scripts for both directories.
- Depends on: Steps 2 and 3.
- Outputs: lint/type-check/test scripts and CI gate.

Step 6. Verify frontend Axios to backend Express integration route.
- Depends on: Steps 2, 3, and 4.
- Outputs: successful end-to-end call under CORS constraints.

Bootstrap exit criteria (blocking)
1. Both apps run locally.
2. Axios successfully calls Express endpoint.
3. CORS permits allowed origin and blocks disallowed origin.
4. Lint and type-check pass in both apps.

## Phase 1: Auth and RBAC Core (Days 5-7)

Step 1. Implement auth endpoints: login, logout, me.
2. Use bcrypt cost factor 12 and JWT expiry 8 hours.
3. Return generic invalid credential errors.
4. Log all login attempts with timestamp, email, IP.
5. Add server-side RBAC middleware and route-level policies.
6. Add auth and authorization tests.

Phase 1 exit criteria
1. Protected routes reject missing/expired token with 401.
2. Teller blocked from admin-only endpoints.
3. Auditor is read-only.
4. Deactivated staff cannot log in.

## Phase 2: Customer and Staff Management (Days 8-10)

Step 1. Staff CRUD (admin-only create/list/view/update/deactivate).
2. Customer CRUD with search and pagination.
3. Customer deactivation cascades account freeze.
4. Frontend pages/forms with role-aware UI controls.

Phase 2 exit criteria
1. Staff role enforcement verified in backend and frontend UX.
2. Customer search by name/email and pagination work.
3. Deactivation cascade behavior verified.

## Phase 3: Account Lifecycle (Days 11-12)

Step 1. Account create/list/detail/update for checking and savings.
2. Unique never-reused account number generation.
3. Status transitions: active, frozen, closed.
4. Type-specific updates: APY for savings, overdraft for checking.

Phase 3 exit criteria
1. Invalid status transitions rejected.
2. Account numbers remain unique and non-reused.
3. Frozen/closed states available for downstream transaction checks.

## Phase 4: Transactions Engine (Days 13-15)

Step 1. Deposit endpoint with amount > 0 and immutable insert.
2. Withdrawal endpoint with amount > 0 and overdraft-limit enforcement.
3. Transfer endpoint in single ACID DB transaction with rollback.
4. Block all posting to frozen/closed accounts.
5. History endpoint with pagination, type/date filters, and auditor global read-only visibility.
6. Frontend transaction forms and history table.

Phase 4 exit criteria (critical)
1. No partial transfer possible under failure.
2. Account balances reconcile with net transaction sum.
3. Transaction records are append-only.

## Phase 5: Hardening and MVP Prototype Release (Days 16-17)

Step 1. Add login rate limiting, secure headers, payload limits, sanitized errors.
2. Validate HTTPS-only deployment and no mixed-content frontend calls.
3. Validate backup and retention setup.
4. Run final regression and release checklist.

Phase 5 exit criteria
1. Security baseline checks pass.
2. Critical flows for admin, teller, auditor pass UAT.
3. MVP prototype deployed and monitored.

## Day-by-Day Sprint Board (Model-Agnostic)

Day 1
1. Bootstrap structure and backend scaffold.
2. Human review checkpoint.

Day 2
1. Frontend scaffold with Axios and backend CORS policy.
2. Human review checkpoint.

Day 3
1. CI, lint, type-check setup.
2. Integration route verification Axios to Express.

Day 4
1. Bootstrap gate close and defect cleanup.
2. Only after gate pass move to auth.

Day 5
1. Auth login and me plus frontend auth state.

Day 6
1. Logout, login audit logging, RBAC middleware.

Day 7
1. Auth and RBAC tests, route policy stabilization.

Day 8
1. Staff management endpoints and UI.

Day 9
1. Customer endpoints, search, pagination and UI.

Day 10
1. Customer deactivate cascade freeze and verification.

Day 11
1. Account endpoints and UI creation flows.

Day 12
1. Account lifecycle rules and type-specific controls.

Day 13
1. Deposit and withdrawal implementation with tests.

Day 14
1. Transfer ACID flow and rollback tests.

Day 15
1. Transaction history endpoint and UI filters.

Day 16
1. Security hardening and staging verification.

Day 17
1. MVP prototype release cutover and monitoring.

## Board Columns and Policies

Columns
1. Backlog
2. Agent Ready
3. Agent Running
4. Human Review
5. QA Verified
6. Done

Operational policies
1. One primary in-progress ticket per human owner.
2. Agent can assist multiple tickets but cannot self-approve critical gates.
3. All p0 tickets must be complete before release ticket starts.
4. Any API contract change requires immediate ticket comment and dependency review.

## Verification Matrix

Auth and RBAC
1. 401 for missing or expired token.
2. 403 for unauthorized role access.

Financial integrity
1. DECIMAL(15,2) used for monetary fields.
2. Balance equals net posted transactions.
3. Transfer rollback leaves both accounts unchanged on failure.

Immutability
1. No edit/delete operations for transactions post-create.
2. Corrections via offsetting transactions only.

Operational
1. Key endpoint performance goals validated per prompt requirements.
2. Backups and retention verified.
3. Deployment performed without downtime regression.

## Decisions

1. This plan is model-agnostic and suitable for switching between agent models mid-sprint.
2. Bootstrap phase is a hard prerequisite before domain features.
3. MVP prototype objective is functional completeness and secure baseline, not full enterprise polish.