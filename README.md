# Money Lego

**Describe how money should move. Money Lego builds the PayPal workflow with AI, shows you exactly what it will do, and runs it after you approve every consequential action.**

Money Lego is an AI-assisted visual automation studio for payment operations, built on the PayPal Developer Platform (sandbox). Small businesses, agencies and creators describe a process in plain English ("when a client pays, split the net 70/20/10, check it, let me approve, pay everyone and tell Slack"). AI drafts a real, typed node graph on a canvas; a deterministic engine validates and runs it against PayPal's APIs; every payout, refund or invoice send pauses for a human to approve exactly what it will do.

> PayPal Sandbox only. Test accounts and test money. No real funds move.

## What works

| Area | What it does |
|---|---|
| **Money Lego assistant** | A main OpenAI agent (floating "Ask Money Lego" on every page) that delegates by tool calls to sub-agents: a **PayPal agent** built on PayPal's official Agent Toolkit (`@paypal/agent-toolkit`, 16 read-only tools: invoices, orders, refunds, disputes, subscriptions, transactions, merchant insights), the workflow builder, run search, Channel3 product search and the payments ledger. Anything that moves money becomes a workflow draft behind a human approval. |
| **AI workflow copilot (Sage)** | Natural language → schema-checked workflow graph using only registered blocks; guardrails reject any money action not behind an approval; edits ("add an approval before the refund") modify the open graph. |
| **Canvas editor** | Node catalog, drag/connect, inspector, validation, versions, run panel with per-step input/output and PayPal ids, "Explain this run" (AI). |
| **PayPal Checkout trigger** | Each workflow gets a hosted checkout page (`/pay/<key>`, PayPal JS SDK). The server sets the price, creates and captures the order; the run starts from PayPal's capture data and the verified `PAYMENT.CAPTURE.COMPLETED` webhook for the same capture never starts a second run. |
| **PayPal webhooks** | `/api/integrations/paypal` verifies every delivery with `verify-webhook-signature`, stores it once by event id, mirrors status, wakes waiting runs and routes events to the owner's workflows (`PayPal event` trigger). |
| **PayPal actions** | Get order, Payouts (batch + status follow-up), Refunds, Invoicing (find / create / send / remind), Subscriptions, Transaction Search. Writes use PayPal-Request-Id idempotency keys derived from run + node. |
| **Exact money** | Integer cents end to end; splits reconcile to the cent (largest-remainder), reserves are calculated but never paid out. |
| **Approval integrity** | An approval computes an *intent* for every money action on its Approved branch (recipients, amounts, capture, invoices), shows it and fingerprints it. The action recomputes its intent and refuses if anything changed. |
| **AI steps** | `AI risk review` (deterministic checks + model judgement, high-risk branch) and `AI write` (per-item drafts, e.g. invoice reminders). Emails are masked and secrets removed before anything reaches the model. AI never moves money. |
| **Payments dashboard** | An AG Studio analytics dashboard (KPIs, charts, ledger, cross-filtering) over every PayPal object and run, editable by drag-and-drop or by asking AG Studio's AI agents (running on our server-side model) to build pages. AG Grid tables and full-text run search alongside. |
| **Templates** | Five DB-backed templates that clone into editable graphs: Revenue split payout, AI invoice reminders, Failed subscription recovery, Approved refund desk, Weekly PayPal ops digest. |
| **Agentic commerce (Shop AI)** | Channel3 product search + AI comparison grounded in Channel3's response, buyer approves a PayPal checkout; the price is re-read from Channel3 server-side. |

## Partner tools used

| Tool | How it's used |
|---|---|
| **PayPal** (required) | Orders/Checkout + JS SDK, Payouts, Invoicing, Refunds, Subscriptions, Transaction Search, Webhooks (verified). |
| **AG Grid / AG Studio** | AG Studio powers the Payments analytics dashboard: two data sources (PayPal objects, workflow runs) with measure columns, a prebuilt report, edit mode, saved layouts, and AG Studio's AI harness wired to Money Lego's model through a server proxy (`/api/studio/llm`). AG Grid Community powers the detail tables. |
| **Channel3** | `POST /v1/search` and `GET /v1/products/{id}` for the Shop AI page and the Channel3 block. |
| **Elastic** | Finished runs are indexed (explicit mapping); run search on Payments uses Elastic, and AI run explanations cite similar past failures. Falls back to MongoDB, labelled, when not configured. |
| **Zapier** | Zapier block posts run data to a Webhooks by Zapier Catch Hook (only `hooks.zapier.com`), reaching 8,000+ apps. |
| **Render** | `render.yaml` Blueprint: web service + one-minute cron heartbeat for durable runs. |
| **Postman** | `postman/money-lego-paypal.postman_collection.json`: every PayPal call Money Lego makes, plus our public endpoints. |
| **Clerk** | Authentication. |
| **OpenAI** | Main agents: Sage (planner, fixer), the Money Lego assistant and its PayPal sub-agent (tool calling), AG Studio's dashboard agents. Model set by `OPENAI_MODEL`. |
| **PayPal Agent Toolkit** | `@paypal/agent-toolkit` (OpenAI integration) powers the PayPal sub-agent, restricted to read-only actions with a second allowlist. |
| **OpenRouter** | Small tasks: AI review, AI write, AI pick, run explanations (falls back to OpenAI's small model). |

Not used: Bryntum (licensed package needs a trial account), APIMatic, KERNEL, Astropods. We don't claim them.

## Run it locally

Requirements: Node 22+, npm, MongoDB with a replica set (Atlas, or `npm run db:up` for local Docker).

```bash
npm install
cp .env.example .env          # fill in MongoDB, Clerk, PayPal sandbox, OpenRouter
npm run paypal:check          # proves OAuth, lists app capabilities, creates a test order
npm run db:seed               # optional: templates are also seeded lazily on first use
npm run dev                   # http://localhost:3000
```

PayPal sandbox setup:

1. developer.paypal.com → Apps & Credentials → Sandbox → create a REST app; copy the client id/secret.
2. In the app's features, enable **Payouts**, **Invoicing** and **Transaction Search** if you want those blocks (the PayPal section on Connections shows what your app was granted).
3. Sandbox → Accounts: use the generated *personal* account to pay checkout pages and *business* account emails (or other personal accounts) as payout recipients.
4. Webhooks need a public HTTPS URL. On Render (or a tunnel), set `APP_URL`, run `npm run paypal:webhook`, and set the printed `PAYPAL_WEBHOOK_ID`. Checkout pages work without webhooks (runs start from the capture response).

The scheduler/heartbeat is `GET /api/cron/workflows` with `Authorization: Bearer $CRON_SECRET`, every minute (Render cron in `render.yaml`).

## Five-minute judge walkthrough

1. Sign up, open **Templates → PayPal Sale → Revenue Split Payout → Use template**.
2. In **Split allocation**, replace the example emails with sandbox accounts. Save, turn the workflow **on**.
3. Select the checkout trigger → **Open** the checkout page → pay with a sandbox personal account.
4. Back in the editor, the run is waiting at **Owner approves payout**: review the AI risk review, recipients and amounts, then **Approve**.
5. The payout batch is sent; **Payout status** follows it until PayPal reports items paid. See every id on **Payments**. Click **Explain this run**.
6. Try **Workflows → Sage**: "When a PayPal subscription payment fails, explain why with AI, alert Slack, and draft a catch-up invoice I approve."

## Tests and checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Unit tests cover exact allocation, approval intents/fingerprints, webhook parsing/routing references, agent guardrails, templates and the workflow engine primitives.

## Architecture

```
Next.js (App Router) ── canvas, inspector, run panel, Payments (AG Studio), Shop AI, Connections (PayPal)
   │
   ├─ /api/agent/*            AI drafting/editing (OpenRouter) → guardrails → saved graph
   ├─ /api/workflows/*        CRUD, versions, enable (trigger activation), test runs
   ├─ /api/workflow-runs/*    approve / reject / retry / cancel / explain (AI)
   ├─ /api/pay/*              public checkout: create + capture orders → start runs
   ├─ /api/integrations/paypal verified webhooks → dedupe → mirror → route → wake
   └─ /api/cron/workflows     durable heartbeat (schedules, expiries, payout re-checks)
        │
        ├─ engine: DAG executor, leases, persisted node runs, waits (approval/delay/provider)
        ├─ server/paypal: OAuth token cache, typed REST wrappers, idempotency, error mapping
        ├─ MongoDB: workflows, versions, runs, node runs, paypal_events, paypal_resources
        └─ Elastic (optional): run index for search
```

## License

MIT, see [LICENSE](LICENSE).
