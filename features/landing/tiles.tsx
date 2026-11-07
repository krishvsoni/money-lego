import type { ReactNode } from "react";
import { BrickGlyph } from "@/features/workflows/node-icon";
import { Reveal } from "./reveal";

// Tiles: a visual on top, then a title and a short description. Each visual is a small,
// real piece of the product rather than an illustration.

export function CenterHeader({ id, title, body }: { id: string; title: string; body?: string }) {
  return (
    <Reveal className="mx-auto max-w-[680px] text-center">
      <h2 id={id} className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink text-balance sm:text-5xl sm:[@media(max-height:860px)]:text-4xl">
        {title}
      </h2>
      {body && <p className="mt-4 text-lg leading-[1.6] text-ink-2 text-pretty [@media(max-height:860px)]:mt-3 [@media(max-height:860px)]:text-base">{body}</p>}
    </Reveal>
  );
}

export function Tile({ visual, title, body, badge, delay = 0 }: { visual: ReactNode; title: string; body: string; badge?: string; delay?: number }) {
  return (
    <Reveal as="li" delay={delay} className="tactile flex flex-col rounded-2xl p-2">
      <div className="tactile-soft flex min-h-40 flex-1 items-center justify-center rounded-lg p-3 [@media(max-height:860px)]:min-h-32 [@media(max-height:860px)]:p-2">{visual}</div>
      <div className="px-2 pb-2 pt-4 [@media(max-height:860px)]:pt-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">{title}</h3>
          {badge && <span className="tactile-soft rounded-full px-3 py-0.5 text-sm font-medium text-ink-2">{badge}</span>}
        </div>
        <p className="mt-1 text-base text-ink-2 text-pretty">{body}</p>
      </div>
    </Reveal>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="tactile w-full max-w-[340px] rounded-xl p-3 text-sm">{children}</div>;
}

function Row({ left, right, tone = "text-ink" }: { left: ReactNode; right: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="min-w-0 text-ink-2">{left}</span>
      <span className={`num shrink-0 whitespace-nowrap font-medium ${tone}`}>{right}</span>
    </div>
  );
}

const CHAIN = [
  { label: "PayPal checkout", color: "var(--brick-2)", icon: "ShoppingCart" },
  { label: "Split", color: "var(--brick-5)", icon: "Split" },
  { label: "AI review", color: "var(--brick-1)", icon: "Sparkles" },
  { label: "Approve", color: "var(--brick-4)", icon: "UserCheck" },
  { label: "PayPal payout", color: "var(--paypal)", icon: "Banknote" },
];

export function ChainVisual() {
  return (
    <ol className="flex flex-col items-center gap-2">
      {CHAIN.map((c) => (
        <li key={c.label} className="tactile flex w-40 items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-3 text-xs font-medium text-ink">
          <BrickGlyph name={c.icon} color={c.color} size="xs" />
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
      <p className="mt-1 text-ink-2">Pay out 86.42 USD to 2 recipients?</p>
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
      <Row left="Capture" right="3C67…993F" tone="text-ink-2" />
      <Row left="Payout batch" right="8YHC…S9VL" tone="text-ink-2" />
      <Row left="Webhook verified" right="WH-7Y…2K" tone="text-ink-2" />
      <div className="mt-1 border-t border-dashed border-line-strong pt-1">
        <Row left="2 of 2 recipients" right="SUCCESS" tone="text-success" />
      </div>
    </Panel>
  );
}
