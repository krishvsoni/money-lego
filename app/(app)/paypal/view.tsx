"use client";

import { PageHeader } from "@/components/page-header";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import type { PaypalStatus } from "@/server/paypal/status";

const FEATURES: Array<[string, string, string]> = [
  ["checkout", "Checkout & Orders", "Hosted checkout pages, order lookup and capture"],
  ["payouts", "Payouts", "Pay recipients by email in one batch"],
  ["invoicing", "Invoicing", "Find, create, send and remind invoices"],
  ["subscriptions", "Subscriptions", "Read subscription billing state"],
  ["reporting", "Transaction Search", "Weekly reports from PayPal's ledger"],
  ["disputes", "Disputes", "Not used by any block yet"],
];

const PARTNERS: Array<[string, string, string, string]> = [
  ["agent", "AI model (OpenRouter)", "Drafts workflows, reviews risk, writes reminders, explains runs.", "Set OPENROUTER_API_KEY to enable the AI features."],
  ["channel3", "Channel3", "Product search block and the AI shopping assistant (Shop AI).", "Set CHANNEL3_API_KEY (promo PAYPAL-HACKATHON-2026 for credits)."],
  ["elastic", "Elastic", "Finished runs are indexed; run search and AI explanations use it.", "Set ELASTIC_URL and ELASTIC_API_KEY. Search falls back to MongoDB until then."],
  ["zapier", "Zapier", "Zapier block sends run data to your Zaps (Catch Hook).", "Add a Zapier Catch Hook credential to use the Zapier block."],
  ["agGrid", "AG Grid", "Powers the Payments dashboard grids (AG Grid Community).", ""],
];

function Row({ ok, title, detail }: { ok: boolean | null; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok === null ? "bg-ink-3" : ok ? "bg-success" : "bg-attention"}`} aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-2">{detail}</span>
      </span>
    </li>
  );
}

export function View() {
  const { data, error, loading, reload } = useResource<PaypalStatus>("/api/paypal/status");
  const s = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <BrandLogo brand="paypal" size={34} /> PayPal connection
          </span>
        }
        description="Money Lego uses one PayPal sandbox REST app configured on the server. Credentials never reach the browser; this page shows what the app is allowed to do, read from the scopes PayPal granted it."
        actions={
          <Button variant="secondary" onClick={reload} busy={loading && !!data}>
            Test connection
          </Button>
        }
      />
      {error && <p className="rounded-md bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>}
      {!s && !error && <div className="h-48 animate-pulse rounded-xl bg-sunken" />}
      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-bold">App</h2>
            <ul className="mt-2 divide-y divide-line">
              <Row ok={s.configured} title={s.configured ? `Configured (${s.environment})` : "Not configured"} detail={s.configured ? `Client ${s.clientIdHint}${s.appId ? ` · app ${s.appId}` : ""}` : "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server."} />
              <Row ok={s.configured ? !s.error : null} title={s.error ? "Couldn't authenticate" : s.configured ? "OAuth token works" : "Not tested"} detail={s.error ?? (s.configured ? `${s.scopeCount} scopes granted to this app.` : "Configure the app first.")} />
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-sm font-bold">Webhook</h2>
            <ul className="mt-2 divide-y divide-line">
              <Row
                ok={Boolean(s.webhook.registered)}
                title={s.webhook.registered ? "Registered with PayPal" : "Not registered"}
                detail={s.webhook.registered ? `${s.webhook.registered.url} · ${s.webhook.registered.events.length} events` : `Run npm run paypal:webhook on the server to register ${s.webhook.expectedUrl}.`}
              />
              <Row
                ok={Boolean(s.webhook.configuredId) && (s.webhook.registered?.matchesConfig ?? false)}
                title={s.webhook.configuredId ? "Signature verification on" : "PAYPAL_WEBHOOK_ID missing"}
                detail={s.webhook.configuredId ? "Every delivery is verified with PayPal's verify-webhook-signature API before it's stored." : "Without it, deliveries are refused. Checkout pages still work through the capture API."}
              />
              <Row ok={s.webhook.publicUrl} title={s.webhook.publicUrl ? "Public HTTPS address" : "Local address"} detail={s.webhook.publicUrl ? "PayPal can reach this server." : "PayPal can't deliver webhooks to localhost. Use the Render deployment or a tunnel."} />
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
            <h2 className="text-sm font-bold">What this app can do</h2>
            <p className="mt-1 text-xs text-ink-2">From the token&apos;s granted scopes. A missing feature can be enabled on the app in the PayPal Developer Dashboard.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([key, title, detail]) => {
                const on = s.features ? Boolean((s.features as Record<string, boolean>)[key]) : null;
                return (
                  <li key={key} className="flex items-start gap-2.5 rounded-lg bg-sunken p-3">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${on === null ? "bg-ink-3" : on ? "bg-success" : "bg-attention"}`} aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="block text-xs text-ink-2">{on === null ? "Unknown until the app authenticates." : on ? detail : "Not granted to this app."}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
            <h2 className="text-sm font-bold">Partner tools</h2>
            <p className="mt-1 text-xs text-ink-2">Hackathon partner tools Money Lego actually uses, and whether each is set up. Nothing here is decoration: an unconfigured tool says so where it&apos;s used.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PARTNERS.map(([key, title, detail, setup]) => {
                const on = Boolean((s.partners as Record<string, boolean>)[key]);
                return (
                  <li key={key} className="flex items-start gap-2.5 rounded-lg bg-sunken p-3">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${on ? "bg-success" : "bg-attention"}`} aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="block text-xs text-ink-2">{on ? detail : setup}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
            <h2 className="text-sm font-bold">Recent webhook events for your workflows</h2>
            {s.events.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">None yet. Pay one of your checkout pages to see PayPal&apos;s PAYMENT.CAPTURE.COMPLETED arrive here.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line text-sm">
                {s.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="font-mono text-xs font-semibold text-ink">{e.eventType}</span>
                    <span className="font-mono text-xs text-ink-2">{e.resourceId}</span>
                    <span className="text-xs text-ink-2">{e.outcome === "started" ? `started ${e.runs} run(s)` : e.outcome}</span>
                    <span className="ml-auto text-xs text-ink-3">{relativeTime(e.receivedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
