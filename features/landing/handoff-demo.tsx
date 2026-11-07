"use client";

import { useEffect, useRef, useState } from "react";
import { LockSimpleIcon, LockSimpleOpenIcon } from "@phosphor-icons/react";
import { formatAmount, splitByPercent } from "@/lib/amounts";

// One run, split down the middle by the line automation can't cross. The left side plays
// itself when the section comes into view: trigger, split, quote, then it stops. The right
// side is the approval, and its buttons work, so the visitor is the one who decides.
// Nothing is sent; it's a local demo of the stop every real workflow makes.

const TOTAL = 9_602n;
const RECIPIENTS = [
  { name: "Creator", share: 7_000 },
  { name: "Agency partner", share: 2_000 },
  { name: "Ops reserve (kept)", share: 1_000 },
];
const PARTS = splitByPercent(TOTAL, RECIPIENTS.map((r) => r.share));
const STEPS = [
  { label: "PayPal capture completed", at: "09:41:02" },
  { label: "Net split to the cent", at: "09:41:02" },
  { label: "AI risk review: low", at: "09:41:03" },
];
const TICK_MS = 650;

type Decision = "pending" | "signed" | "rejected";

const usd = (raw: bigint) => formatAmount(raw, 2, 2);

export function HandoffDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(0);
  const [decision, setDecision] = useState<Decision>("pending");
  const ready = done >= STEPS.length;

  // Steps tick in once, the first time the panel is mostly on screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setDone(STEPS.length);
          return;
        }
        timer = setInterval(() => {
          setDone((d) => {
            if (d + 1 >= STEPS.length) clearInterval(timer);
            return Math.min(STEPS.length, d + 1);
          });
        }, TICK_MS);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, []);

  return (
    <div ref={root} className="tactile grid overflow-hidden rounded-2xl p-2 text-left md:grid-cols-[1fr_auto_1fr]">
      <section aria-label="What automation does" className="flex flex-col p-4">
        <Caption tone="text-ink-3" title="Runs on its own" />
        <ol className="mt-4 flex flex-col gap-3" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s.label} className={`flex items-center gap-3 text-base transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${i < done ? "opacity-100" : "translate-y-1 opacity-0"}`}>
              <Check />
              <span className="flex-1 text-ink">{s.label}</span>
              <span className="num text-sm text-ink-3">{s.at}</span>
            </li>
          ))}
          <li className={`mt-1 flex items-center gap-3 border-t border-dashed border-line-strong pt-4 text-base transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}>
            <RunStatus decision={decision} />
          </li>
        </ol>
      </section>

      <Divider decision={decision} />

      <section aria-label="What only you can do" className="tactile-soft flex flex-col rounded-xl p-4">
        <Caption tone="text-ink" title="Only you approve" />
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="num font-display text-3xl font-semibold tracking-tight text-ink">${usd(TOTAL)} net</p>
          <span className="text-sm text-ink-3">PayPal Payouts</span>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {RECIPIENTS.map((r, i) => (
            <li key={r.name} className="flex justify-between gap-2">
              <span className="text-ink-2">{r.name}</span>
              <span className={`num font-medium ${decision === "signed" ? "text-success" : decision === "rejected" ? "text-ink-3 line-through" : "text-ink"}`}>${usd(PARTS[i])}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-4">
          {decision === "pending" ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!ready} onClick={() => setDecision("rejected")} className="press tactile h-10 rounded-full text-base font-semibold text-ink disabled:opacity-50">
                Reject
              </button>
              <button type="button" disabled={!ready} onClick={() => setDecision("signed")} className="press tactile-ink h-10 rounded-full text-base font-semibold disabled:opacity-50">
                Approve
              </button>
            </div>
          ) : (
            <div className="flex h-10 items-center justify-between gap-3">
              <p className="text-base font-medium text-ink">{decision === "signed" ? "Approved. PayPal payout sent." : "Rejected. Nothing moved."}</p>
              <button type="button" onClick={() => setDecision("pending")} className="press rounded-full px-3 py-1 text-sm font-medium text-ink-2 hover:bg-white">
                Try again
              </button>
            </div>
          )}
          <p className="mt-2 text-center text-xs text-ink-3">{!ready ? "Waiting for the run to reach you" : decision === "pending" ? "Your call. This demo sends nothing." : "Demo only. No funds moved."}</p>
        </div>
      </section>
    </div>
  );
}

function Caption({ title, tone }: { title: string; tone: string }) {
  return <p className={`text-sm font-semibold ${tone}`}>{title}</p>;
}

function Check() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-wash text-xs text-success" aria-hidden>
      ✓
    </span>
  );
}

function RunStatus({ decision }: { decision: Decision }) {
  if (decision === "signed") {
    return (
      <>
        <Check />
        <span className="flex-1 text-ink">Approved by you</span>
        <span className="text-sm font-medium text-success">Paid 2 of 2</span>
      </>
    );
  }
  if (decision === "rejected") {
    return (
      <>
        <span className="h-2 w-2 shrink-0 rounded-full bg-ink-3" aria-hidden />
        <span className="flex-1 text-ink">Rejected by you</span>
        <span className="text-sm font-medium text-ink-3">Stopped</span>
      </>
    );
  }
  return (
    <>
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-attention opacity-60 motion-reduce:hidden" />
        <span className="relative h-2 w-2 rounded-full bg-attention" />
      </span>
      <span className="flex-1 text-ink">Waiting for your approval</span>
      <span className="text-sm font-medium text-attention">Paused</span>
    </>
  );
}

// The line itself, with a lock keycap sitting on it. The keycap is the same height and
// material as the approval buttons, and its state follows the run: locked while automation
// works and waits, open once you approve, still locked if you reject.
const LOCK = {
  pending: { label: "Locked", tone: "text-ink", Icon: LockSimpleIcon },
  signed: { label: "Opened", tone: "text-success", Icon: LockSimpleOpenIcon },
  rejected: { label: "Locked", tone: "text-ink-3", Icon: LockSimpleIcon },
} as const;

function Divider({ decision }: { decision: Decision }) {
  const { label, tone, Icon } = LOCK[decision];
  return (
    <div className="relative flex items-center justify-center py-3 md:px-4 md:py-0">
      <span className="absolute inset-x-4 top-1/2 border-t border-dashed border-line-strong md:inset-x-auto md:inset-y-4 md:left-1/2 md:border-l md:border-t-0" aria-hidden />
      <span
        role="status"
        title="No money moves across this line without your approval"
        className={`tactile relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold [text-shadow:0_1px_0_#fff] transition-colors duration-300 ${tone}`}
      >
        <span key={decision} className="reveal inline-flex items-center gap-2">
          <Icon size={16} weight="bold" aria-hidden />
          {label}
        </span>
        <span className="sr-only">. No money moves across this line without your approval.</span>
      </span>
    </div>
  );
}
