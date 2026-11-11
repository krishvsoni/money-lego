# Kernel evaluation for Money Lego

Issue #4. Evaluated against Kernel's docs and `@onkernel/sdk` 0.146.0 (checked 2026-11-11) and this repository's engine. The project dashboard requires a login, so it was not inspected; see [What to check in the dashboard](#what-to-check-in-the-dashboard).

## Recommendation

**Adopt Kernel, but only as one read-only "Browser check" workflow step.** It fits a real gap and our deployment model well. It must never be used to log in to PayPal, fill a checkout or move money: PayPal's APIs stay the only way money moves, behind a Human approval.

The first use is the **AI Product Sourcing** template: just before the purchase approval, a browser opens the chosen product's real page and confirms the price and stock. A mismatch takes a "changed" branch instead of reaching the approval. Estimated effort: about one day for the step, executor and tests.

## What Money Lego needs from a browser

Money Lego moves money through PayPal's APIs, which a browser must not replace. Browser automation is useful only where there is no API:

| Need | Example | Fit |
|---|---|---|
| Confirm a product page before buying | Price and stock on the merchant's own page match what Channel3 and the AI reported | Strong |
| Evidence for an approval | Screenshot or replay link attached to "Approve purchase" | Good (replays) |
| Read a vendor portal without an API | Order or shipping status | Later; needs a stored login (see below) |
| Pay, log in to PayPal, submit checkouts | — | **Never.** Breaks the approval model and PayPal's terms |

## Integration with our Next.js / API architecture

- **No browser in our deployment.** With Playwright Execution, the Playwright code runs inside Kernel's VM next to Chromium (`POST /browsers/{id}/playwright/execute`). We send fixed code and get JSON back, so nothing large ships in Vercel functions and no Chromium is bundled. This is the main reason it fits.
- **Fits the engine as-is.** It becomes one node definition in `lib/nodes/catalog` and one executor in `server/engine/executors`, with no change to the canvas or engine. It's read-only, so it's `retrySafe: true`.
- **One browser per attempt.** Creation is about 30 ms (p50), so there's no pool to manage. Each attempt creates a headless browser with a short `timeout_seconds` and deletes it in `finally`. If our function dies first, Kernel deletes the browser itself after the timeout.
- **Time budget.** Execute defaults to 60 s and allows up to 300 s. We'd cap the step at 30 s, well inside a serverless request.
- **Inputs are data, never code.** Users configure a URL and what to read, not Playwright code. The URL is embedded with `JSON.stringify` into a fixed script (see `scripts/kernel-poc.ts`).

## Authentication, secrets and tenant isolation

- **API key.** `KERNEL_API_KEY`, server only, never sent to the browser or to AI models. Use a **project-scoped key** granting only `browsers:create`, `browsers:use` and `browsers:delete`. Kernel supports this scoping, and a scoped key can't manage keys, pools or other projects.
- **One key for all tenants**, so isolation is our job:
  - Every run gets a fresh browser; there are no shared profiles or persisted cookies in v1.
  - Browsers are isolated from each other at the hypervisor level (Kernel runs each one in its own unikernel VM).
  - Tag browsers with the hashed owner tag we already use for AI calls (`ownerTag`), never a raw id or email.
- **SSRF.** The browser runs on Kernel's network, not ours, so it can't reach our internal services. That's the threat `safe-fetch.ts` guards against. We still require `https://` (no credentials in the URL), support an "allowed host" like the HTTP step does, and fail if the page redirects to another host or downgrades to `http://`. These rules live in `lib/browser/url-policy.ts` and the browser lifecycle in `lib/browser/kernel-check.ts` (`checkPage`); the PoC and the eventual executor both call `checkPage`, so neither relies on a printed label. Hosts are compared after normalizing (lowercase, punycode, no trailing dot), and a subdomain counts as another host.
- **Untrusted page content.** Pages can carry prompt injection. The step returns only structured fields (title, price, currency, availability, final URL), with truncated text, before anything reaches an AI step. AI already can't move money.
- **Replay URLs are sensitive** (Kernel says so). They're shown only to the workflow owner and never sent to AI or to viewers of shared workflows.
- **Stored logins (Kernel Managed Auth / Vaults)** would mean holding users' third-party credentials. Out of scope until there's a concrete use case and a per-tenant vault design.

## Reliability, observability and failure recovery

| Failure | Handling |
|---|---|
| Page slow, crashed or out of memory ("Page crashed") | The run fails at this step with a clear message; the owner can retry the run, which is safe because the step only reads |
| Bot wall or CAPTCHA | `stealth: true`. Configurable proxies need a paid plan. The step reports "couldn't read the page" and never guesses a price |
| Rate limit (429) | The SDK retries twice, honouring `Retry-After`. Our plain-REST PoC does not, which is one reason the real step should use the SDK |
| Concurrency limit reached (org-wide) | The run fails at this step with "too many browsers right now"; retry the run. The limit is 5 on the free plan |
| Our process dies mid-step | `timeout_seconds` makes Kernel delete the browser, so nothing leaks. Because the step is `retrySafe`, the engine re-runs it on the next pass instead of failing the run |
| No structured product data on the page | Returns `offers: []`; the template treats "price not confirmed" as needing manual review, never as a match |

For observability, write the Kernel `session_id` and timings into the run log. Optionally start a replay for failed checks only. Replays are kept 1 day on Developer and 7 days on Hobbyist.

## Pricing, operational overhead and lock-in

| | Developer (free) | Hobbyist ($30/mo) |
|---|---|---|
| Included usage | $5/month | $10/month |
| Concurrent browsers | 5 | 10 |
| Configurable proxies | No | Yes |
| Replay retention | 1 day | 7 days |

Headless browsers cost $0.0000166667/s (about $0.06/hour), billed only while active. A 10-second check costs about $0.00017, so 1,000 checks cost about $0.17. **The free plan covers the hackathon and a demo**; the limit we'd hit first is concurrency, not money. Set a project spending cap anyway.

- **Operational overhead:** low. No browsers to host, patch or scale; one env var.
- **Lock-in:** low. Browsers speak standard CDP and WebDriver BiDi, and Kernel's browser image and VM runtime are open source. Playwright Execution itself is Kernel-specific, but it would be confined to one executor file. Moving to another cloud-browser vendor, or to self-hosted Playwright on a long-running worker, means rewriting that one file.

## Proof of concept

`scripts/kernel-poc.ts` does exactly what the step would do. It needs no new dependency (plain REST):

```bash
# .env: KERNEL_API_KEY=<project-scoped key>
npm run kernel:poc -- https://<a product page> [allowed-host]
```

It creates a headless stealth browser (60 s auto-delete), loads the page, reads the title and any schema.org `Product` offers (price, currency, availability), checks the final host, prints timings and always deletes the browser. A cross-host redirect exits non-zero and prints none of the page's data.

**Verified so far:**
- The URL checks work: it refuses `http://` and wrong hosts, and a cross-host redirect fails the run (`tests/browser-check.test.ts`, against a fake Kernel).
- It reaches Kernel's real API: an invalid key gets Kernel's own `401`.

**Not yet verified:** a full run with a real key. Next step: add the project key to `.env` and run it against two or three real product pages, including one that blocks bots.

## What to check in the dashboard

The project dashboard needs a login, so whoever owns it should confirm:
1. **Plan:** Developer or Hobbyist (decides proxies and concurrency).
2. **API key:** create a **project-scoped** key with only browser create/use/delete.
3. **Spending cap:** set one on the project.
4. **After running the PoC:** no browsers are left running.

## If we build it: scope of the step

- **Node:** `browser.check` ("Check web page"), category Integrations, provider `kernel`. Not a side effect, so it needs no approval of its own.
- **Config:**
  - `url` (https, expression allowed)
  - `allowedHost`
  - `expectPrice` and `expectCurrency` (optional, expression)
  - `timeoutSeconds` (max 30)
- **Output:** `{ finalUrl, title, offers, checkedAt, session }`.
- **Ports:** `matches` / `changed`, when an expected price is set.
- **Template change:** insert it between "AI picks the best one" and "You approve the purchase". The approval message shows "Price confirmed on the merchant's page".
- **Env:** `KERNEL_API_KEY`. The step reports "not configured" when it's missing, like the other partner tools.
- **Tests:**
  - Offer parsing from JSON-LD (single, `@graph`, list, missing).
  - Host and redirect checks.
  - Price comparison in integer cents.
  - The executor always deletes the browser, including when execution fails.
