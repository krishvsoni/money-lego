# Devpost submission draft — Money Lego

## Tagline

Describe it. Inspect it. Approve it. Run it. AI-built PayPal payment workflows you approve before money moves.

## Inspiration

Small agencies, creators and online businesses run payment operations across the PayPal dashboard, spreadsheets, chat approvals and one-off scripts. Splitting a client payment with collaborators, chasing late invoices or recovering failed subscription payments is manual, error-prone and has no audit trail. Developers who could automate it end up maintaining fragile webhook glue.

## What it does

Money Lego turns a plain-English payment process into an editable, auditable workflow on PayPal:

- **AI copilot** drafts a real node graph (PayPal triggers, exact splits, AI checks, approvals, PayPal actions, notifications) from a sentence, using only registered blocks. Guardrails reject any money action that isn't directly behind a human approval.
- **PayPal checkout trigger**: every workflow can have a hosted PayPal checkout page; a completed capture starts the run, and the verified webhook for the same capture never starts a second one.
- **Real PayPal actions**: Payouts (with item-level status follow-up), Refunds, Invoicing (find, create, send, remind), Subscriptions and Transaction Search, all with idempotency keys.
- **Approvals bound to exact intents**: the approver sees recipients, amounts, captures and invoices plus an AI risk review; each action is fingerprinted and refuses to run if anything changed after approval.
- **AI that helps, never pays**: AI risk review, AI-drafted reminders, AI run explanations grounded in the stored run (and similar past failures via Elastic). Emails are masked before reaching the model.
- **Payments dashboard** on AG Grid with every PayPal object and run, plus full-text run search.
- **Agentic commerce**: an AI shopping assistant grounded in Channel3 product data, with the buyer approving a PayPal checkout.

## How we built it

Next.js 16 + React 19 + TypeScript, MongoDB, React Flow canvas, a deterministic DAG engine with leases, persisted node runs and durable waits (approvals, delays, payout status). PayPal REST APIs (Orders v2, Payments v2, Payouts v1, Invoicing v2, Subscriptions v1, Transaction Search, Webhooks v1) and the PayPal JS SDK, all server-side with a cached OAuth token. AI through OpenRouter with schema-validated JSON (zod). Clerk for auth. Deployed on Render with a cron heartbeat.

## How AI is used

1. Natural language → workflow graph (schema-constrained JSON, validated against the node registry; a second "fixer" pass repairs flagged safety issues).
2. Editing an open workflow by instruction.
3. AI risk review node (combined with deterministic checks) shown to the approver.
4. AI write node: per-item drafts (e.g. overdue invoice reminders) from real invoice data.
5. Explain this run: plain-language summary of a run from its persisted record, citing similar past failures (Elastic).
6. Shop AI: ranks and explains only Channel3-returned products.

AI never authorises money movement: deterministic validation plus a fingerprinted human approval gate every payout, refund and invoice send.

## Tools used

PayPal Developer Platform (sandbox): Orders/Checkout + JS SDK, Payouts, Invoicing, Refunds, Subscriptions, Transaction Search, Webhooks · OpenRouter (models configured in OPENROUTER_MODELS) · AG Grid Community · Channel3 API · Elastic (Elasticsearch) · Zapier (Webhooks by Zapier) · Render · Postman · Clerk · MongoDB · Next.js · React Flow · zod.

## Challenges

Making approvals mean "exactly this" (intent fingerprints), reconciling capture-API and webhook paths into one run, cent-exact splits, and keeping every PayPal write idempotent across retries and restarts.

## What's next

Customer-managed PayPal connections (Partner onboarding), dispute triage, scheduled payout windows on a calendar view, more connectors.

## Demo video outline (under 3 minutes)

| Time | Shot |
|---|---|
| 0:00–0:15 | Problem + canvas. |
| 0:15–0:40 | Sage prompt → generated graph. |
| 0:40–1:00 | Inspect split, AI review, approval; fix a validation issue. |
| 1:00–1:30 | Pay the workflow's PayPal checkout page with a sandbox buyer. |
| 1:30–1:55 | Run starts from the capture; webhook verified and deduplicated. |
| 1:55–2:20 | Approve the fingerprinted payout; PayPal batch id; payout status. |
| 2:20–2:35 | Payments dashboard (AG Grid), run search, Explain this run. |
| 2:35–2:40 | "Describe it. Inspect it. Approve it. Run it." |
