"use client";

import type { ReactNode } from "react";

// How a checkout ends, shown to the buyer as one clear moment: a ring draws itself, then the
// mark inside it (a check for paid, a cross for declined or cancelled, an hourglass while
// PayPal finishes), and an emoji pops onto the badge. Paid also throws a small burst of
// confetti dots; declined shakes once, the way a refused passcode does. Nothing loops.

export type Outcome = "paid" | "pending" | "declined" | "cancelled";

const LOOK: Record<Outcome, { emoji: string; ring: string; wash: string; label: string }> = {
  paid: { emoji: "🎉", ring: "var(--success)", wash: "var(--success-wash)", label: "Payment complete" },
  pending: { emoji: "⏳", ring: "var(--attention)", wash: "var(--attention-wash)", label: "Payment pending" },
  declined: { emoji: "😕", ring: "var(--danger)", wash: "var(--danger-wash)", label: "Payment declined" },
  cancelled: { emoji: "👋", ring: "var(--ink-3)", wash: "var(--sunken)", label: "Payment cancelled" },
};

// Confetti: where each dot flies to, and its colour from the brick palette.
const BURST = [
  { x: -46, y: -30, c: "var(--brick-1)" },
  { x: 44, y: -34, c: "var(--brick-2)" },
  { x: -54, y: 8, c: "var(--brick-6)" },
  { x: 54, y: 4, c: "var(--brick-4)" },
  { x: -30, y: 42, c: "var(--brick-2)" },
  { x: 32, y: 44, c: "var(--brick-5)" },
  { x: 0, y: -52, c: "var(--brick-3)" },
  { x: -8, y: 52, c: "var(--brick-1)" },
];

function Mark({ outcome }: { outcome: Outcome }) {
  if (outcome === "paid") return <path className="pay-mark" pathLength={1} d="M24 37.5l8.5 8.5L49 28.5" />;
  if (outcome === "pending")
    return (
      <>
        <path className="pay-mark" pathLength={1} d="M28 24h16M28 48h16M30 24c0 8 12 8 12 12s-12 4-12 12M42 24c0 8-12 8-12 12s12 4 12 12" />
      </>
    );
  return (
    <>
      <path className="pay-mark" pathLength={1} d="M27 27l18 18" />
      <path className="pay-mark pay-mark-2" pathLength={1} d="M45 27L27 45" />
    </>
  );
}

export function PaymentOutcome({ outcome, title, children }: { outcome: Outcome; title?: string; children?: ReactNode }) {
  const look = LOOK[outcome];
  return (
    <div role="status" aria-live="polite" className="pay-outcome flex flex-col items-center text-center" data-outcome={outcome}>
      <div className={`relative h-[88px] w-[88px] ${outcome === "declined" ? "pay-shake" : ""}`}>
        {outcome === "paid" &&
          BURST.map((d, i) => (
            <span
              key={i}
              aria-hidden
              className="pay-confetti absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full"
              style={{ background: d.c, ["--x" as string]: `${d.x}px`, ["--y" as string]: `${d.y}px`, ["--i" as string]: i }}
            />
          ))}
        <span aria-hidden className="pay-wash absolute inset-1 rounded-full" style={{ background: look.wash }} />
        <svg viewBox="0 0 72 72" className="relative h-full w-full" fill="none" stroke={look.ring} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle className="pay-ring" pathLength={1} cx="36" cy="36" r="31" transform="rotate(-90 36 36)" />
          <Mark outcome={outcome} />
        </svg>
        <span aria-hidden className="pay-emoji absolute -top-1 -right-2 select-none text-[28px] leading-none drop-shadow-[0_2px_4px_rgb(9_9_11/0.15)]">
          {look.emoji}
        </span>
      </div>
      <h2 className="pay-copy mt-4 text-xl font-bold tracking-tight text-ink">{title ?? look.label}</h2>
      {children && <div className="pay-copy mt-1.5 max-w-[34ch] text-sm leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}
