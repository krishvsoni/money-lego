"use client";

import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { BrandLogo, type Brand } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import type { PaypalStatus } from "@/server/paypal/status";

// The PayPal section of Connections, built from the same pieces as the rest of the page:
// a section heading with one line of help, then tactile cards with a key-cap icon, a title,
// a one-line status and a coloured dot. Credentials never reach the browser; everything here
// is read from the scopes PayPal granted the server's app.

type Tone = "ok" | "warn" | "off";
const DOT: Record<Tone, string> = { ok: "bg-success", warn: "bg-attention", off: "bg-ink-3" };

// The service's real logo on a white key cap, the same as the connection tiles below.
function BrandKeycap({ brand }: { brand: Brand }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white shadow-[0_1px_2px_rgb(9_9_11/0.06)]" aria-hidden>
      <BrandLogo brand={brand} size={20} />
    </span>
  );
}

const PaypalKeycap = () => <BrandKeycap brand="paypal" />;

function StatusLine({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-ink-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="tactile flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{title}</p>
          <div className="mt-1.5 flex flex-col gap-1">{children}</div>
        </div>
      </div>
    </li>
  );
}

const FEATURES: Array<[string, string]> = [
  ["checkout", "Checkout & orders"],
  ["payouts", "Payouts"],
  ["invoicing", "Invoicing"],
  ["subscriptions", "Subscriptions"],
  ["reporting", "Transaction search"],
  ["disputes", "Disputes"],
];

const PARTNERS: Array<{ key: string; title: string; brand: Brand; on: string; off: string }> = [
  { key: "agent", title: "AI model (OpenRouter)", brand: "openrouter", on: "Drafts workflows, reviews payments, writes reminders and explains runs.", off: "Set OPENROUTER_API_KEY to turn on the AI features." },
  { key: "channel3", title: "Channel3", brand: "channel3", on: "Real product data for the Channel3 product search block.", off: "Set CHANNEL3_API_KEY to search real products." },
  { key: "elastic", title: "Elastic", brand: "elastic", on: "Run history is indexed; search and AI explanations use it.", off: "Set ELASTIC_URL and ELASTIC_API_KEY. Search uses the database until then." },
  { key: "zapier", title: "Zapier", brand: "zapier", on: "The Zapier block can send run data to your Zaps.", off: "Add a Zapier Catch Hook under Your own secrets to use the Zapier block." },
  { key: "agGrid", title: "AG Grid & AG Studio", brand: "ag-grid", on: "Powers the Payments dashboard and tables.", off: "" },
];

export function PaypalPanel() {
  const { data: s, error, loading, reload } = useResource<PaypalStatus>("/api/paypal/status");
  const features = (s?.features ?? null) as Record<string, boolean> | null;
  const partners = (s?.partners ?? {}) as Record<string, boolean>;

  return (
    <>
      <section aria-labelledby="paypal">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="paypal" className="flex items-center gap-2 font-display text-xl font-semibold">
              <BrandLogo brand="paypal" size={18} /> PayPal
            </h2>
            <p className="mt-1 text-sm text-ink-2">The sandbox PayPal app every PayPal block uses. Its keys stay on the server; this shows what it may do.</p>
          </div>
          <Button variant="secondary" onClick={reload} busy={loading && !!s}>
            <ArrowsClockwiseIcon size={16} weight="bold" aria-hidden /> Test connection
          </Button>
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-danger-wash p-3 text-sm text-danger">{error}</p>}
        {!s && !error && <div className="mt-4 h-40 animate-pulse rounded-2xl bg-sunken" aria-label="Checking PayPal" />}

        {s && (
          <>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <Card icon={<PaypalKeycap />} title={`App${s.configured ? ` · ${s.environment === "live" ? "Live" : "Sandbox"}` : ""}`}>
                <StatusLine tone={!s.configured ? "warn" : s.error ? "warn" : "ok"}>
                  {!s.configured ? "Not set up. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server." : s.error ? s.error : `Connected · client ${s.clientIdHint}`}
                </StatusLine>
                {s.configured && !s.error && <StatusLine tone="ok">{s.scopeCount} permissions granted by PayPal</StatusLine>}
              </Card>
            </ul>

            <div className="tactile mt-3 rounded-2xl p-4">
              <p className="font-semibold text-ink">What this app can do</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {FEATURES.map(([key, label]) => {
                  const on = features ? Boolean(features[key]) : null;
                  return (
                    <li key={key} className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm ${on ? "border-success/30 bg-success-wash text-ink" : "border-line bg-paper text-ink-3"}`}>
                      <span className={`h-2 w-2 rounded-full ${on === null ? "bg-ink-3" : on ? "bg-success" : "bg-attention"}`} aria-hidden />
                      {label}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-ink-3">Missing one? Turn it on for the app in the PayPal Developer Dashboard, then test again.</p>
            </div>
          </>
        )}
      </section>

      {s && (
        <section aria-labelledby="partners">
          <h2 id="partners" className="font-display text-xl font-semibold">Partner tools</h2>
          <p className="mt-1 text-sm text-ink-2">Other services Money Lego works with, and whether each is set up here.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {PARTNERS.map((p) => {
              const on = Boolean(partners[p.key]);
              return (
                <Card key={p.key} icon={<BrandKeycap brand={p.brand} />} title={p.title}>
                  <StatusLine tone={on ? "ok" : "warn"}>{on ? p.on : p.off}</StatusLine>
                </Card>
              );
            })}
          </ul>
        </section>
      )}

      {s && s.events.length > 0 && (
        <section aria-labelledby="events">
          <h2 id="events" className="font-display text-xl font-semibold">Recent PayPal events</h2>
          <p className="mt-1 text-sm text-ink-2">Verified webhook deliveries about your workflows.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {s.events.map((e) => (
              <li key={e.id} className="tactile flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl px-4 py-3">
                <PaypalKeycap />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[13px] font-semibold text-ink">{e.eventType}</p>
                  <p className="truncate font-mono text-xs text-ink-3">{e.resourceId}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${e.outcome === "started" ? "bg-success-wash text-success" : "bg-sunken text-ink-2"}`}>
                  {e.outcome === "started" ? `Started ${e.runs} run${e.runs === 1 ? "" : "s"}` : e.outcome}
                </span>
                <span className="text-xs text-ink-3">{relativeTime(e.receivedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
