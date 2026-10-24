import type { ReactNode } from "react";
import { formatAmount, splitByPercent } from "@/lib/amounts";
import { Reveal } from "./reveal";

// Tiles: a visual on top, then a title and a short description. Each visual is a small,
// real piece of the product rather than an illustration.

export function CenterHeader({ id, title, body }: { id: string; title: string; body?: string }) {
  return (
    <Reveal className="mx-auto max-w-[680px] text-center">
      <h2 id={id} className="text-2xl font-medium tracking-tight text-ink text-balance sm:text-3xl">
        {title}
      </h2>
      {body && <p className="mt-3 text-base text-ink-2 text-pretty">{body}</p>}
    </Reveal>
  );
}

export function Tile({ visual, title, body, badge, delay = 0 }: { visual: ReactNode; title: string; body: string; badge?: string; delay?: number }) {
  return (
    <Reveal as="li" delay={delay} className="tactile flex flex-col rounded-2xl p-2">
      <div className="tactile-soft flex min-h-48 flex-1 items-center justify-center rounded-lg p-4">{visual}</div>
      <div className="px-2 pb-2 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {badge && <span className="tactile-soft rounded-full px-2 py-0.5 text-xs font-medium text-ink-2">{badge}</span>}
        </div>
        <p className="mt-1 text-sm text-ink-2 text-pretty">{body}</p>
      </div>
    </Reveal>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="tactile w-full max-w-[300px] rounded-xl p-3 text-xs">{children}</div>;
}

function Row({ left, right, tone = "text-ink" }: { left: ReactNode; right: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-ink-2">{left}</span>
      <span className={`num font-medium ${tone}`}>{right}</span>
    </div>
  );
}

// Computed with the same function the workflow engine runs.
export function ExactVisual() {
  const shares = [3_333, 3_333, 3_334];
  const parts = splitByPercent(100_000_000n, shares);
  return (
    <Panel>
      {["Design", "Engineering", "Operations"].map((name, i) => (
        <Row key={name} left={`${name} ${(shares[i] / 100).toFixed(2)}%`} right={formatAmount(parts[i], 0)} />
      ))}
      <div className="mt-1 border-t border-dashed border-line-strong pt-1">
        <Row left="Total in base units" right={`${formatAmount(parts.reduce((a, b) => a + b, 0n), 0)} exact`} tone="text-[var(--brick-6)]" />
      </div>
    </Panel>
  );
}

const dot = (color: string) => <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} aria-hidden />;

export function ResumeVisual() {
  return (
    <Panel>
      <Row left={<>{dot("var(--success)")}Webhook trigger</>} right="Done" tone="text-success" />
      <Row left={<>{dot("var(--attention)")}Human approval</>} right="Waiting" tone="text-attention" />
      <Row left={<>{dot("var(--line-strong)")}Server restarted</>} right="09:41" tone="text-ink-3" />
      <Row left={<>{dot("var(--progress)")}Human approval</>} right="Resumed" tone="text-progress" />
    </Panel>
  );
}

export function DedupeVisual() {
  return (
    <Panel>
      <p className="num text-ink-3">idempotency-key: delivery-0417</p>
      <Row left="First delivery" right="202 run 6adc1f" />
      <Row left="Retry after 30 s" right="200 run 6adc1f" />
      <Row left="Retry after 5 min" right="200 run 6adc1f" />
      <div className="mt-1 border-t border-dashed border-line-strong pt-1">
        <Row left="Payouts started" right="1" tone="text-[var(--brick-6)]" />
      </div>
    </Panel>
  );
}

export function QuoteVisual() {
  return (
    <Panel>
      <p className="text-ink-3">Example quote</p>
      <Row left="You send" right="2,500.00 USDC" />
      <Row left="Protocol fee, 0.5%" right="12.50 USDC" />
      <Row left="Recipients receive" right="2,487.50 USDC" />
      <Row left="SOL needed up front" right="0.0412 SOL" tone="text-ink-2" />
    </Panel>
  );
}

const CHAIN = [
  { label: "Webhook", color: "var(--brick-2)" },
  { label: "Split", color: "var(--brick-5)" },
  { label: "Approve", color: "var(--brick-4)" },
  { label: "Sign", color: "var(--brick-1)" },
];

export function ChainVisual() {
  return (
    <ol className="flex flex-col items-center gap-2">
      {CHAIN.map((c) => (
        <li key={c.label} className="tactile flex w-40 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink">
          <span className="h-3 w-4 rounded-[3px]" style={{ background: c.color }} aria-hidden />
          {c.label}
        </li>
      ))}
    </ol>
  );
}

export function ApprovalVisual() {
  return (
    <Panel>
      <p className="font-semibold text-attention">Needs your approval</p>
      <p className="mt-1 text-ink-2">Pay 2,500 USDC to 4 recipients?</p>
      <div className="mt-3 flex gap-2">
        <span className="tactile rounded-full px-3 py-1 font-semibold text-ink">Reject</span>
        <span className="tactile-ink rounded-full px-3 py-1 font-semibold">Approve</span>
      </div>
    </Panel>
  );
}

export function SignaturesVisual() {
  return (
    <Panel>
      <Row left="Funding" right="4mGx…Fn7m" tone="text-ink-2" />
      <Row left="Route setup 1" right="9rTp…Wx2a" tone="text-ink-2" />
      <Row left="Session setup 1" right="7kLm…Qv4b" tone="text-ink-2" />
      <div className="mt-1 border-t border-dashed border-line-strong pt-1">
        <Row left="4 of 4 recipients" right="Paid" tone="text-success" />
      </div>
    </Panel>
  );
}
