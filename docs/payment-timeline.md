# Payment timeline (Bryntum)

`/payments` → **Timeline** tab. Issue #6.

## What it shows

Every payment's life on one time axis, next to the workflow runs that handled it:

- **Milestones:** order approved, capture pending / completed / declined, refund, dispute, payout paid / problem, invoice paid.
- **Bars:** workflow runs, drawn from start to finish. A run still going is drawn up to now.
- **Rows:** one per workflow (default), or one per payment. A payment row holds the capture, the run it started and everything that run created (payouts, refunds), plus the order the capture paid.
- **Colours:** one per state (completed, pending, failed, refunded, disputed, payout problem). The chips above the chart are the legend and the filter.
- **Interaction:**
  - Hover a milestone for amount, status, short PayPal id, workflow and failure reason.
  - Click it for details, **Open the run**, or **Find in PayPal objects**.
  - Zoom with the buttons or the mouse wheel.

## The AI question

Ask in plain words, e.g. "Show failed captures last week" or "Summarize payments stuck in pending".

1. The server builds the owner's timeline and sends the model a redacted list of milestones: short PayPal ids, masked emails, no credentials. It uses the existing `askJson` boundary (`server/ai/model.ts`).
2. The model may only return `{ summary, filter, milestoneIds }`. The server checks every workflow id and milestone id against real data, and keeps the filter's dates inside the selected 7/30/90-day period (`boundDateRange` in `lib/payments/timeline-view.ts`): unparseable dates are dropped, and a reversed range or one entirely outside the period is discarded. The page applies the same bound again, so a date from an earlier answer can't escape a shorter period chosen later.
3. The page shows the summary, applies the filter and outlines the milestones. The model has no tools, so it can't start, refund or pay anything.

Endpoint: `POST /api/payments/timeline/ask { question, days }`, with the agent rate limit (6 per minute).

## Data and guarantees

- **Sources:** `GET /api/payments/timeline?days=7|30|90`, built only from the signed-in owner's `paypalResources`, `workflowRuns`, and the `paypalEvents` about their objects or workflows.
- **Webhooks are the source of truth.** Nothing is inferred from the browser's return page. Changes appear after **Refresh**.
- **No duplicates.** A milestone's id comes from what it is (kind + PayPal id + status). A webhook PayPal delivers twice, or our own record plus PayPal's confirmation, collapse into one milestone at the earliest time seen.
- **Privacy.** Full PayPal ids never leave the server: the timeline shows `…last6`, and ids are hashed.
- **Unknown statuses** show as pending, never as completed.
- **Bounded reads, never silently partial.** Each source is one newest-first query with a product limit (`TIMELINE_LIMITS`): 1,000 PayPal objects, 1,000 webhook events and 300 workflow runs per timeline. Each query asks for one record more than its limit. If a source has more, the response carries `truncation: { sources, completeSince }`, the page shows a "Showing part of the last N days" notice with the time it is complete from, and the AI is told the history is incomplete. Below the limits, `truncation` is `null`.
- **Mapping:** `lib/payments/timeline.ts` (pure functions, unit tested in `tests/payment-timeline.test.ts`).
- **Known gap:** a refund event can't always be linked to its capture, because PayPal's webhook summary we store has no capture id. It still lands on the right workflow row.

## Bryntum

- **Packages:** `@bryntum/scheduler-community` + `@bryntum/scheduler-react-community` 8.0.0, the MIT Community tier, so there's no licence key or trial watermark.
- **Loading:** the scheduler loads only in the browser and only when the tab opens (`next/dynamic`, `ssr: false`), so other pages don't carry its code or CSS.
- **Read-only:** no dragging, resizing, editing or context menus.
