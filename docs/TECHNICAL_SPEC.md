<p>
  <img src="assets/logo.png" width="44" alt="Money Lego" align="left" />
  <b>Money Lego: technical specification</b><br />
  <sub>For engineers working on or reviewing the codebase. The product overview is in the <a href="../README.md">README</a>.</sub>
</p>
<br clear="left" />

---

## Contents

1. [System overview](#1-system-overview)
2. [Stack](#2-stack)
3. [Architecture](#3-architecture)
4. [Workflow model](#4-workflow-model)
5. [Execution engine](#5-execution-engine)
6. [Money safety](#6-money-safety)
7. [PayPal integration](#7-paypal-integration)
8. [AI: Sage, the assistant and AI blocks](#8-ai-sage-the-assistant-and-ai-blocks)
9. [Channel3 product sourcing](#9-channel3-product-sourcing)
10. [Approvals, notifications and sharing](#10-approvals-notifications-and-sharing)
11. [Payments ledger and dashboard](#11-payments-ledger-and-dashboard)
12. [Data model](#12-data-model)
13. [HTTP API](#13-http-api)
14. [Security](#14-security)
15. [Configuration](#15-configuration)
16. [Running, testing and scripts](#16-running-testing-and-scripts)
17. [Astropods deployment](#astropods-deployment)
18. [Known limitations](#18-known-limitations)

---

## 1. System overview

Money Lego is a Next.js application in which a workflow is a typed graph of blocks ("nodes"). A deterministic engine executes the graph against PayPal's REST APIs and other providers. AI drafts and edits graphs, reviews payments and explains runs, but it never authorises money movement: every PayPal action that moves money or contacts a customer must sit directly behind a Human approval, enforced when a workflow is saved and again when it runs.

## 2. Stack

| Layer | Choice |
| --- | --- |
| Web app | Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript, Tailwind CSS 4 |
| Canvas | React Flow (`@xyflow/react`) |
| Validation | zod 4 (API bodies, AI output, node configs) |
| Database | MongoDB 7 driver (replica set required for transactions) |
| Auth | Clerk (`@clerk/nextjs`) |
| Payments | PayPal REST (Orders v2, Payments v2, Payouts v1, Invoicing v2, Subscriptions v1, Reporting/Transaction Search, Webhooks v1), PayPal JS SDK, `@paypal/agent-toolkit` |
| AI | OpenAI (main agents) and OpenRouter (small tasks), with fallback between them |
| Search | Elastic (optional; falls back to MongoDB) |
| Dashboard | AG Studio (`ag-studio`, `ag-studio-react`) and AG Grid Community |
| Product data | Channel3 API |
| Tests | Vitest |

## 3. Architecture

```
Browser (Next.js App Router)
 ├─ /workflows            list, Sage composer + orchestration modal, templates
 ├─ /workflows/[id]       canvas editor, inspector, run panel, Sage dock, share dialog
 ├─ /payments             money summary + AG Studio dashboard, run search
 ├─ /templates, /connections
 ├─ /pay/[key], /pay/done hosted PayPal checkout and return page (public)
 └─ notification bell + corner notices (approvals and shares) on every app page

Route handlers (/api/*)  ── route() wrapper: auth, zod body, rate limits, error envelope
 ├─ agent/*        Sage crew: draft, edit, assist (streamed NDJSON)
 ├─ workflows/*    CRUD, versions, enable, status, duplicate, runs, shares, transfer
 ├─ workflow-runs/* detail, approve, cancel, retry, explain
 ├─ approvals      notifications feed (pending approvals + share notices)
 ├─ pay/*          public checkout: create + capture orders → start runs
 ├─ integrations/* verified inbound webhooks (PayPal, Shopify, Stripe, Discord, Telegram)
 ├─ hooks/[key]    signed generic webhook trigger
 └─ cron/workflows durable heartbeat (schedules, expiries, provider re-checks)

server/
 ├─ engine/        DAG executor (advance.ts), executors per node family, intents,
 │                 runs service, inbound routing, wake-ups
 ├─ agent/         crew (planner, guard, fixer, connector, builder), guardrails,
 │                 model client with streaming + fallback (openrouter.ts)
 ├─ paypal/        OAuth token cache, typed REST wrappers, webhook verification,
 │                 resource ledger, ownership checks, status/overview
 ├─ workflows/     service, access (roles), sharing, activation of triggers
 ├─ integrations/  Channel3, Elastic, Google Sheets, Airtable, Notion, credential checks
 └─ db/            collections, indexes, transactions, ids

astropods/agent.mts ── the Money Lego assistant as an Astropods chat agent (same server code)
```

## 4. Workflow model

A workflow is `{ schemaVersion, nodes[], edges[] }` (`lib/workflow/types.ts`). Each node has a `type` from the registry (`lib/nodes/registry.ts`), a `config`, and a position. Edges connect an output port (for example `approved`, `rejected`, `true`, `false`, `failed`) to a target.

**Block catalog** (`lib/nodes/catalog/*`):

| Family | Blocks |
| --- | --- |
| Triggers | `trigger.manual`, `trigger.webhook`, `trigger.schedule`, `trigger.paypal_checkout`, `trigger.paypal_event`, `trigger.github`, `trigger.shopify`, `trigger.discord` |
| PayPal | `paypal.get_order`, `paypal.payout`, `paypal.payout_status`, `paypal.refund`, `paypal.find_invoices`, `paypal.create_invoice`, `paypal.send_invoice`, `paypal.get_subscription`, `paypal.transactions`, `paypal.checkout_link`, `paypal.wait_checkout` |
| Logic | `logic.condition`, `logic.filter`, `logic.approval`, `logic.once` |
| Data | `data.allocate` (exact splits), `data.validate`, `data.map` |
| AI | `ai.review`, `ai.write`, `ai.pick` |
| Commerce | `shop.search` (Channel3) |
| Integrations | `notify.slack`, `notify.discord`, `notify.telegram`, `zapier.send`, `http.request`, `sheets.lookup_rows`, `airtable.lookup`, `notion.get_page`, `notion.create_page` |
| Utilities | `util.delay`, `util.log` |

Expressions in configs use `{{ input.x }}`, `{{ trigger.x }}`, `{{ nodes.<id>.x }}` and `{{ run.id }}` (`lib/workflow/expressions.ts`). Every save creates an immutable row in `workflow_versions`; runs snapshot the graph they started with.

## 5. Execution engine

`server/engine/advance.ts` walks the graph in topological order:

- A node runs when every incoming edge's source has settled and at least one of them fired on the matching port. Otherwise the node is marked **skipped** (so branches merge correctly).
- Node runs are persisted in `node_runs`. A run holds a lease, so two workers never advance it at once.
- **Waits** are durable: `approval`, `delay` and `provider` (for example payout status or buyer payment). A run records `nextWakeAt`; the cron heartbeat (`/api/cron/workflows`, every minute) and the editor's polling (`?advance=1`) wake due runs.
- **Retries:** steps marked `retrySafe: false` (PayPal writes, HTTP calls, messages) are never blindly retried if interrupted mid-request.
- **Test data:** the editor's Run button uses the trigger's test payload (`source: "test"`). Such runs are labelled **TEST** in the UI (`lib/workflow/test-mode.ts`). Their PayPal steps still run against the sandbox.

## 6. Money safety

| Mechanism | Where |
| --- | --- |
| Every money action (payout, refund, invoice send, checkout link) must be connected only to a Human approval's `approved` port: checked on save, on template validation and on AI drafts | `lib/templates/validate.ts`, `server/agent/guardrails.ts` |
| The approval computes an **intent** for each money action on its approved branch (recipients, amounts, capture, invoices) and fingerprints it; the action recomputes it and refuses to run if anything changed | `server/engine/intents.ts` |
| Integer cents end to end; splits use largest-remainder rounding; rows without an email are reserves the business keeps | `lib/amounts.ts`, `data.allocate` |
| Idempotency: PayPal writes use `PayPal-Request-Id` keys derived from run + node, and reuse earlier results | `server/engine/executors/paypal.ts` |
| `logic.once` claims a business key (order, capture, invoice) so the same thing is never acted on twice | `logic.once` executor |
| Checkout price is set by the server and, for Channel3 products, re-read from Channel3 after approval; a changed price aborts | `paypal.checkout_link` |
| Ownership: an account never acts on PayPal objects another account's workflows created | `server/paypal/ownership.ts` |
| AI output is untrusted: schema-checked, unknown blocks dropped, credentials blanked, emails masked before reaching a model | `server/agent/guardrails.ts`, `server/ai/model.ts` |

## 7. PayPal integration

- **Auth:** client-credentials OAuth with a cached token (`server/paypal/client.ts`). `npm run paypal:check` proves credentials and capabilities.
- **Hosted checkout:** `/pay/[key]` renders the PayPal JS SDK. The server creates the order at the workflow's price, captures it, and starts the run from the capture. The verified `PAYMENT.CAPTURE.COMPLETED` webhook for the same capture never starts a second run.
- **Checkout links:** `paypal.checkout_link` creates an order whose return URL is `/pay/done?status=…&w=<workflow>&run=<run>`. PayPal adds `token=<orderId>`; `/api/checkout-return` resolves it for the signed-in owner, so the page links straight back to the run.
- **Webhooks:** `/api/integrations/paypal` verifies each delivery with `verify-webhook-signature`, stores it once by event id, mirrors status into the ledger, wakes waiting runs and routes events to `trigger.paypal_event` workflows. Register with `npm run paypal:webhook`.
- **Ledger:** every PayPal object a workflow creates or PayPal reports is upserted into `paypal_resources` with owner, workflow, run, status and amount.
- **Agent Toolkit:** the assistant's PayPal sub-agent uses `@paypal/agent-toolkit` restricted to read-only actions plus a second allowlist.

## 8. AI: Sage, the assistant and AI blocks

**Sage** (`server/agent/*`) runs a crew over a streamed NDJSON response, which the UI renders live (crew rail, sketch of blocks, activity log):

| Member | Job |
| --- | --- |
| Planner | Turns the request into blocks and wiring (schema-constrained JSON, streamed so blocks sketch as they're written) |
| Guard | Validates the graph and the money rules; on edits, runs a health check of settings, connections, PayPal and recent runs |
| Fixer | Repairs what Guard flags without user input |
| Connector | Links accounts the user already connected |
| Builder | Lays out the canvas and saves the workflow, turned off |

**Model routing** (`server/agent/openrouter.ts`): tier `main` (OpenAI `OPENAI_MODEL` first), tier `small` (OpenRouter models first), tier `fast` (OpenAI's small model first, for things a person is waiting on, such as "Explain this run"). Each tier falls through to the other provider on timeouts, outages or unusable output. The provider name is never shown to users; it goes to the server log.

**AI blocks:** `ai.review` (deterministic checks + model judgement, high-risk branch), `ai.write` (per-item drafts), `ai.pick` (choose from search results, checked by id). **Explain this run** (`server/ai/explain.ts`) summarises a compacted, size-bounded run record, optionally citing similar past failures from Elastic.

## 9. Channel3 product sourcing

`server/integrations/channel3.ts` wraps `POST /v1/search` and `GET /v1/products/{id}`, normalising each product to the cheapest in-stock offer. `shop.search` returns products, `ai.pick` chooses one with a reason, the approval shows the exact item and price, and `paypal.checkout_link` re-checks the price before creating the PayPal order. The run panel's **Purchase** card shows the product (photo, brand, store, rating, features) refreshed live from `/api/products/[id]`, plus the approval, checkout and payment steps with their PayPal ids.

Channel3 does not place merchant orders (its checkout API is announced as "coming soon"). The business is the merchant of record; fulfilment is a separate step.

## 10. Approvals, notifications and sharing

- **Approvals inbox:** `/api/approvals` returns every run waiting on a Human approval across the owner's workflows (up to 30), plus share notices. A shared client store (`features/approvals/approvals-store.ts`) polls every 15 s while the page is visible. The bell sorts approvals into *Expiring soon*, *Waiting on you* (oldest first) and *Expired*. The review dialog steps through the queue, updates the moment you click Approve or Reject, and reverts if the server refuses.
- **Sharing:** roles are `owner`, `editor` and `viewer` (`lib/workflow/sharing.ts`). Editors change the graph; only the owner runs it, turns it on, shares, transfers or archives it. When an editor saves, the owner's connection slots are restored server-side (`keepOwnerCredentials`). Ownership transfer switches the workflow off, clears connections and rotates its webhook/checkout key.
- **Share notices:** new shares ring the bell and show a corner notice; "seen" state is kept per device.

## 11. Payments ledger and dashboard

`server/paypal/status.ts` builds KPIs and rows from `paypal_resources` and `workflow_runs`. The page shows a native **money summary** (Captured, Paid out, Refunded, Net kept), where each total expands to the PayPal ids behind it, above an **AG Studio** report (KPI tiles, charts, ledger), which can be customised by drag and drop or by AG Studio's AI agents through a server proxy (`/api/studio/llm`).

## 12. Data model

MongoDB collections (`server/db/names.ts`):

| Collection | Holds |
| --- | --- |
| `members` | Accounts (Clerk identity, name, email, verification) |
| `workflows` | Current graph, owner, status, enabled, trigger activation, webhook key, schedule |
| `workflow_versions` | Immutable graph per save |
| `workflow_shares` | Per-email access (`viewer` or `editor`), unique per workflow |
| `workflow_runs` | Run state, trigger payload, waiting state, log, lease, next wake-up |
| `node_runs` | Per-node status, port, input/output, wait state, attempts |
| `paypal_resources` | The PayPal ledger (orders, captures, refunds, payout batches and items, invoices, subscriptions) |
| `paypal_events` | Verified webhook deliveries, by event id |
| `credentials` | Encrypted connection secrets (keyring with rotation) |
| `workflow_templates` | Published templates |
| `once_keys`, `oauth_states`, `telegram_links`, `rate_limits`, `locks` | Idempotency, OAuth state, links, throttling, distributed locks |

## 13. HTTP API

All routes go through `route()` (`server/http/handler.ts`): authentication, zod-validated bodies, rate limits and a consistent `{ error: { code, message, requestId } }` envelope.

| Area | Endpoints |
| --- | --- |
| Workflows | `GET/POST /api/workflows`, `GET/PUT /api/workflows/[id]`, `POST …/duplicate`, `POST …/enabled`, `POST …/status`, `GET/POST …/runs` |
| Sharing | `GET/POST …/shares`, `PATCH/DELETE …/shares/[shareId]`, `POST …/transfer` |
| Runs | `GET /api/workflow-runs/[id]`, `POST …/approve`, `…/cancel`, `…/retry`, `…/explain` |
| Notifications | `GET /api/approvals` (pending approvals + share notices) |
| AI | `POST /api/agent/draft`, `POST /api/agent/edit` (streamed), `POST /api/assistant`, `POST /api/studio/llm` |
| Checkout (public) | `GET /api/pay/[key]`, `POST …/orders`, `POST …/orders/[orderId]/capture`; `GET /api/checkout-return` (owner only) |
| Data | `GET /api/payments`, `GET /api/search`, `GET /api/products/[id]`, `GET /api/templates`, `GET /api/templates/[slug]` |
| Connections | `GET /api/connections`, `POST /api/connections/start`, `GET /api/connections/[slug]/callback`, `/api/credentials/*` |
| Inbound | `POST /api/integrations/{paypal,shopify,stripe,discord,telegram}`, `POST /api/hooks/[key]` |
| Ops | `GET /api/cron/workflows` (Bearer `CRON_SECRET`), `GET /api/health`, `GET /api/config`, `GET /api/paypal/status` |

## 14. Security

- **CSP:** strict default; the `/pay/*` routes allow PayPal's documented domains. Images allow `https:` for merchant product photos.
- **Inbound requests:** every inbound webhook is signature-verified (PayPal postback, HMAC, Ed25519) and deduplicated by provider event id.
- **Outbound requests:** `safeFetch` blocks private addresses and refuses redirects; `http.request` can pin an allowed host.
- **Secrets:** connection secrets are encrypted at rest with a rotating keyring (`npm run keys:rotate`) and are never returned to the browser.
- **Access:** no access reads as "not found", so ids reveal nothing; permission errors explain what the role allows.
- **Rate limits:** per user and per action (`server/http/rate-limit.ts`).

## 15. Configuration

See `.env.example`. The essentials:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public base URL (checkout return links, webhooks) |
| `MONGODB_URI`, `MONGODB_DB` | Database (replica set) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Sign-in |
| `PAYPAL_ENVIRONMENT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | PayPal app (sandbox) |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_SMALL_MODEL` | Main AI |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODELS` | Small AI tasks / fallback |
| `CHANNEL3_API_KEY` | Product data |
| `ELASTIC_URL`, `ELASTIC_API_KEY`, `ELASTIC_INDEX` | Run search (optional) |
| `NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY` | AG Studio licence (optional; trial mode without it) |
| `CRON_SECRET` | Protects the heartbeat endpoint |
| `CREDENTIALS_KEYRING` | Encryption keys for connection secrets |
| `*_CLIENT_ID` / `*_CLIENT_SECRET` | OAuth apps for Slack, Discord, GitHub, Google, Shopify, Stripe, Airtable, Notion |

## 16. Running, testing and scripts

```bash
npm install
cp .env.example .env
npm run db:up            # local MongoDB replica set (Docker), or use Atlas
npm run paypal:check     # OAuth, app capabilities, a test order
npm run db:seed          # templates (also seeded lazily)
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run typecheck` / `lint` / `test` / `build` | Quality gates (Vitest suites in `tests/`) |
| `npm run paypal:webhook` | Registers the PayPal webhook for `APP_URL` |
| `npm run telegram:webhook` | Registers the Telegram bot webhook |
| `npm run keys:rotate` | Re-encrypts credentials with the newest key |
| `npm run thumbnails` | Regenerates template thumbnails |

Production needs a scheduler that calls `GET /api/cron/workflows` with `Authorization: Bearer $CRON_SECRET` every minute.

## Astropods deployment

The assistant runs on [Astropods](https://astropods.com) as blueprint [`krish/money-lego`](https://astropods.com/krish/money-lego): the same `runAssistant` crew wrapped in an `@astropods/adapter-core` adapter (`astropods/agent.mts`), with per-conversation memory. It acts as one Money Lego account (`MONEY_LEGO_ACCOUNT_ID`) and never moves money.

| File | Purpose |
| --- | --- |
| `astropods.yml` | Blueprint spec: build, messaging interface, inputs |
| `astropods/agent.mts` | The agent adapter |
| `astropods/Dockerfile` | Linux image running the server code with `tsx` (no Next.js build) |
| `AGENT.md` | Description on the blueprint page |

```bash
ast login
ast secrets create ML_MONGODB_URI        # also ML_OPENAI_API_KEY, ML_OPENROUTER_API_KEY,
                                         # ML_PAYPAL_CLIENT_ID, ML_PAYPAL_CLIENT_SECRET
ast spec validate
ast push money-lego -V public
ast deploy krish/money-lego -n "Money Lego" --wait \
  --var MONEY_LEGO_ACCOUNT_ID=<account id> \
  --var PAYPAL_ACCOUNT_OWNER_IDS=<account id> \
  --var MONGODB_URI=@ML_MONGODB_URI \
  --var OPENAI_API_KEY=@ML_OPENAI_API_KEY \
  --var OPENROUTER_API_KEY=@ML_OPENROUTER_API_KEY \
  --var PAYPAL_CLIENT_ID=@ML_PAYPAL_CLIENT_ID \
  --var PAYPAL_CLIENT_SECRET=@ML_PAYPAL_CLIENT_SECRET \
  --var APP_URL=https://money-lego.vercel.app
```

After a change: `ast push money-lego`, then `ast agent redeploy --name "Money Lego" --latest`. `@astropods/messaging` can't install on Windows, so the Astropods packages are installed only inside the Docker image and `tsconfig.json` excludes `astropods/`. MongoDB must accept connections from Astropods' outbound IPs.

## 18. Known limitations

- **Sandbox only:** one PayPal app serves the deployment; per-customer PayPal connections (Partner onboarding) are future work.
- **Payout region:** PayPal refuses Payouts from some merchant countries (for example India-registered sandbox apps, `PAYOUT_NOT_AVAILABLE`); use a US sandbox business app.
- **Unclaimed payouts:** sandbox payouts to addresses without a sandbox account end up `UNCLAIMED` (`RECEIVER_UNREGISTERED`); use sandbox personal account emails.
- **Merchant orders:** Channel3 has no live order API yet, so product purchases stop at the paid PayPal order.
- **Provider checks:** without the cron heartbeat, waiting runs only advance while the editor polls them.
