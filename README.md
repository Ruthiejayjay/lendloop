# LendLoop

> **Borrow what you need. Lend what you don't.**

LendLoop is a neighborhood tool-lending board where neighbors list tools they're willing to lend, request date-range borrows, manage approvals and returns, and receive automated notifications and daily overdue reminders powered by **n8n**.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Authentication:** Clerk (`@clerk/nextjs`)
- **Backend & Database:** Convex (queries, mutations, internal actions, HTTP routes)
- **Workflow Automation:** Self-hosted n8n via Docker Compose

---

## Features

- **Public Board (Unauthenticated):** Read-only list of currently available tools showing **name and category only** (no owner PII), paired with a Clerk sign-in CTA.
- **Authenticated Workspace:**
  - **All Tools:** Browse all listings with availability status, filter by category, view lender Trusted badges, and submit date-range borrow requests.
  - **My Listings:** Create, edit, and delete your own tool listings (`name`, `category`, `condition`, `description`).
  - **My Requests & Incoming Requests:** Track borrow requests, approve/decline incoming requests on your own tools, and mark approved loans as returned.
  - **Recent Automation Activity:** Each loan surfaces its latest n8n notification or overdue reminder status (e.g., *"Reminder sent 2 days ago"* or *"Notification sent to ..."*).
- **Role-Based Access Control (`user` vs `admin`):**
  - `user`: Create, edit, and delete only their own listings; act only on requests involving their own tools or borrowing.
  - `admin`: View all loans across the platform, remove any listing, and mark/unmark lenders as **Trusted Lender**.
  - All role and ownership checks are enforced in Convex backend functions—never only in the UI.
- **Bidirectional HMAC-Secured n8n Workflows:**
  - `n8n/workflows/request-notification.json` — Real-time notifications when borrow requests are created, approved, declined, or returned.
  - `n8n/workflows/overdue-reminders.json` — Daily scheduled job fetching overdue loans from Convex, notifying borrowers, and writing reminder status back idempotently.
  - `n8n/workflows/error-workflow.json` — Dedicated `Error Trigger` handler linked to both workflows so failures are surfaced visibly.

---

## Architecture

```text
┌──────────────────────┐       Clerk JWT        ┌────────────────────────────────────┐
│  Next.js App Router  │ ─────────────────────► │           Convex Backend           │
│  + Clerk Auth UI     │ ◄───────────────────── │                                    │
│  (Public & Authed)   │    Reactive Queries    │  • Auth & RBAC guards (lib/auth)   │
└──────────────────────┘                        │  • Tools & Loans mutations/queries │
                                                │  • automationEvents (idempotent)   │
                                                └──────────┬──────────────▲──────────┘
                                                           │              │
                        POST /webhook/lendloop-request-events             │ GET /api/n8n/overdue-loans
                        (HMAC-SHA256 + timestamp, retries)                │ POST /api/n8n/reminder-status
                                                           │              │ (HMAC-SHA256 + idempotencyKey)
                                                           ▼              │
                                                ┌─────────────────────────┴──────────┐
                                                │     Self-Hosted n8n (Docker)       │
                                                │  1. Request Notification (Webhook) │
                                                │  2. Overdue Reminders (Daily Cron) │
                                                │  3. Error Handler (Error Trigger)  │
                                                └────────────────────────────────────┘
```

### Data Model (`convex/schema.ts`)

| Table | Purpose | Key Indexes |
| --- | --- | --- |
| `users` | Synced Clerk identity, `role` (`user` \| `admin`), `trustedLender` flag | `by_clerk_id`, `by_role` |
| `tools` | Tool listings with category, condition, description, and `available` / `borrowed` status | `by_owner`, `by_category`, `by_status` |
| `loans` | Borrow requests & active/historical loans, `toolNameSnapshot`, `lastReminderSentAt` | `by_tool`, `by_owner`, `by_borrower`, `by_status_end_date` |
| `automationEvents` | Audit trail & deduplication store for notifications and reminders | `by_loan`, `by_idempotency_key` |

---

## Environment Variables

### 1. Local app & Docker (`.env.local`)
Copy `.env.example` to `.env.local` and populate:

| Variable | Required | Description |
| --- | --- | --- |
| `CONVEX_DEPLOYMENT` | Yes | Auto-populated by `npx convex dev` |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex Cloud deployment URL |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Yes | Convex HTTP actions base URL (`https://<deployment>.convex.site`), also passed to n8n as `CONVEX_SITE_URL` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (`pk_test_...`) |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (`sk_test_...`) |
| `N8N_HMAC_SECRET` | Yes | Shared 32-byte hex secret (`openssl rand -hex 32`) used by n8n to verify/sign payloads |
| `N8N_WEBHOOK_BASE_URL` | Optional | Defaults to `http://localhost:5678/` |

### 2. Convex Deployment Env Vars (`npx convex env set`)

| Variable | Required | Description |
| --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Yes | Clerk Frontend API / Issuer URL (`https://<app>.clerk.accounts.dev`) |
| `N8N_HMAC_SECRET` | Yes | Must match `N8N_HMAC_SECRET` in `.env.local` |
| `N8N_REQUEST_WEBHOOK_URL` | Yes | Reachable n8n webhook URL (`https://<tunnel-or-host>/webhook/lendloop-request-events`) |
| `ADMIN_EMAILS` | Optional | Comma-separated email allowlist automatically granted `admin` on sync |

---

## Local Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Free [Clerk](https://clerk.com) and [Convex](https://convex.dev) accounts

### 1. Install dependencies & initialize Convex
```bash
npm install
npx convex dev
```
Keep `npx convex dev` running in one terminal. It will create `.env.local` with your Convex URLs and push `convex/schema.ts` and functions.

### 2. Configure Clerk + Convex Auth
1. Create an application in the [Clerk Dashboard](https://dashboard.clerk.com) and copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` into `.env.local`.
2. Activate the Clerk → Convex integration (or create a `convex` JWT template) and copy the **Issuer URL**.
3. In Clerk Dashboard → **Configure → Sessions → Customize session token**, ensure `aud`, `email`, and `name` are included so Convex receives profile claims on the session token:
   ```json
   {
     "aud": "convex",
     "email": "{{user.primary_email_address}}",
     "name": "{{user.full_name}}"
   }
   ```
4. Set the Clerk issuer in Convex:
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://<your-clerk-domain>"
   ```

### 3. Generate the shared HMAC secret
```bash
openssl rand -hex 32
```
Save the output to `.env.local` as `N8N_HMAC_SECRET=<secret>` and set the same value in Convex:
```bash
npx convex env set N8N_HMAC_SECRET "<secret>"
```

### 4. Start the Next.js app
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 5. Promote an Admin user (for testing RBAC)
Sign in once at `http://localhost:3000` so your Clerk user syncs into Convex, then promote via the CLI-only internal mutation:
```bash
npx convex run users:setUserRoleInternal '{"email":"you@example.com","role":"admin"}'
```
*(To test borrowing/approvals locally, open an Incognito window and sign in with a second account.)*

### 6. Start local n8n & import workflows
```bash
docker compose --env-file .env.local up -d
```
1. Open [http://localhost:5678](http://localhost:5678) and create your local n8n login.
2. Create **three separate workflows** and import each file via **`...` → Import from File**:
   - `n8n/workflows/error-workflow.json` → **Publish**
   - `n8n/workflows/request-notification.json` → **Settings → Error Workflow → `LendLoop - Error Handler`** → **Publish**
   - `n8n/workflows/overdue-reminders.json` → **Settings → Error Workflow → `LendLoop - Error Handler`** → **Publish**

### 7. Verify n8n integrations end-to-end
- **Verify HMAC rejection (`401 Unauthorized`):**
  ```bash
  curl -i -X POST http://localhost:5678/webhook/lendloop-request-events \
    -H "Content-Type: application/json" \
    -d '{"eventType":"request_created"}'
  ```
- **Test Overdue Reminders & idempotency:**
  1. Approve a borrow request with a past return date (e.g., yesterday).
  2. Click **Execute** on `LendLoop - Daily Overdue Reminders` in n8n.
  3. Confirm the loan card updates to *"Reminder sent just now"* and `docker logs lendloop-n8n --tail 20` prints `[LendLoop Overdue Reminder]`.
  4. Click **Execute** a second time to verify zero duplicate reminders are created.
- **Test live Convex → n8n Request Notifications:**
  Because `npx convex dev` runs in Convex Cloud, expose local n8n temporarily via a tunnel:
  ```bash
  npx cloudflared tunnel --url http://localhost:5678
  ```
  Set the webhook URL in Convex:
  ```bash
  npx convex env set N8N_REQUEST_WEBHOOK_URL "https://<your-tunnel>.trycloudflare.com/webhook/lendloop-request-events"
  ```
  Create, approve, decline, or return a borrow request in the app and watch the loan card update to *"Notification sent to ..."*.

---

## Security & Data-Minimization Decisions

1. **Backend-Enforced RBAC (`convex/lib/auth.ts`):**
   - Every query and mutation resolves the caller strictly from the verified Clerk JWT (`ctx.auth.getUserIdentity()`); never from client-supplied user IDs or roles.
   - `assertOwner` enforces least privilege: even admins cannot edit another neighbor's listing or approve/decline requests on someone else's tools; admins are scoped strictly to listing removal, viewing all loans, and toggling `trustedLender`.
   - Privilege escalation is prevented: `syncCurrentUser` never accepts `role` or `trustedLender` arguments from clients; admin elevation happens exclusively via server-side `ADMIN_EMAILS` or the non-public `internalMutation` (`users:setUserRoleInternal`).
2. **Strict Data Minimization:**
   - The public query `tools.listPublicAvailable` projects **only** `{ _id, name, category }` on the server; owner identities, emails, and descriptions never leave Convex for unauthenticated visitors.
   - Authenticated tool/loan views omit sensitive fields (`clerkId`, `email`).
   - Outbound n8n webhook payloads and the `/api/n8n/overdue-loans` endpoint include only the minimal fields required to compose and deliver a notification (recipient name/email, tool name, dates, and event metadata).
3. **Bidirectional HMAC-SHA256 Signing & Replay Protection (`convex/lib/hmac.ts`):**
   - Every Convex ↔ n8n HTTP call signs `${timestamp}.${rawBody}` (or `${timestamp}.GET:/api/n8n/overdue-loans` for GET) using HMAC-SHA256.
   - Receivers verify the signature against the **exact raw request bytes** using constant-time comparison (`crypto.timingSafeEqual` in n8n; constant-time XOR loop in Web Crypto on Convex) and enforce a **±5-minute timestamp window** to mitigate replay attacks.
4. **Secret Hygiene:**
   - Zero secrets are committed in source code or exported n8n workflow JSON files. Secrets live exclusively in `.env.local` (gitignored), Convex deployment env vars, and container environment / n8n Credentials.
5. **Idempotency & Visible Failure Handling:**
   - Reminder write-backs require a deterministic `idempotencyKey` (`overdue_reminder:<loanId>:<YYYY-MM-DD>`) indexed in `automationEvents.by_idempotency_key`, making HTTP retries safe and duplicate-free.
   - Convex's `notifyLoanEvent` action performs bounded retries with backoff for transient 5xx/network failures and records `failed` events visibly on the loan card rather than failing silently.
   - n8n HTTP nodes have retries enabled (`maxTries: 3`), and both active workflows route unhandled exceptions to `LendLoop - Error Handler`.
6. **Data Integrity Guards:**
   - Active approved loans block tool deletion (preventing orphaned checkouts); approving one request atomically marks the tool `borrowed` and declines competing pending requests; `toolNameSnapshot` preserves historical loan readability if a tool is later removed.

---

## What I Would Change for Production

1. **Managed Hosting & Secret Management:**
   - Run Next.js on Vercel/AWS ECS behind HTTPS/WAF, Convex in a production deployment, and self-hosted n8n on AWS ECS/Fargate with PostgreSQL (replacing SQLite) and Queue Mode (Redis + workers) behind a private ALB/TLS endpoint instead of a dev tunnel.
   - Store `N8N_HMAC_SECRET`, Clerk keys, and notification credentials in AWS Secrets Manager / KMS with automated rotation and **dual-key HMAC verification** (accepting `current` and `previous` secret during rotation windows to avoid downtime).
2. **Real Notification Delivery & Deliverability:**
   - Replace the mock log nodes in n8n with a transactional email/messaging provider (e.g., AWS SES, Resend, or Slack) configured via encrypted **n8n Credentials**, with SPF/DKIM/DMARC, unsubscribe/preferences support, and per-user rate caps.
3. **Observability, Alerting & Dead-Letter Handling:**
   - Connect Sentry and Datadog (structured logs, latency/error dashboards) to Next.js and Convex, and wire `LendLoop - Error Handler` to PagerDuty/Slack so failed workflow executions page on-call.
   - Add a dead-letter retry job or UI "Retry notification" button for `failed` `automationEvents`.
4. **Abuse Protection & Input Hardening:**
   - Add edge rate limiting on auth/write endpoints and n8n webhooks (WAF / IP allowlisting where static egress IPs exist).
   - Add server-side pagination on `tools.listAll`, `loans.listAllForAdmin`, and `/api/n8n/overdue-loans` (cursor-based batching so daily reminders scale cleanly past thousands of loans).
5. **Domain & Lifecycle Polish:**
   - Support calendar date-range overlap booking (allowing future reservations while a tool is currently borrowed), soft-deletes with an immutable audit log for admin actions, and timezone-aware reminder scheduling.
6. **Automated Testing & CI/CD:**
   - Add automated unit/integration tests using `convex-test` specifically asserting every RBAC boundary (e.g., `user` cannot call `listAllForAdmin`, `setTrustedLender`, edit another user's tool, or delete another user's tool), HMAC tampering/replay rejection tests, and idempotency tests in GitHub Actions.