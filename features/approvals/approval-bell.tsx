"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, ShieldCheck } from "lucide-react";
import { actionable, inboxSections, URGENCY_TONE, waitingFor } from "./approval-meta";
import { openReview, useApprovals } from "./approvals-store";

// "Now", refreshed every minute while something shows times, so "Waiting 3 hours" and
// "2 hours left" stay true without a reload.
export function useNow(active: boolean, everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}

// The bell in the nav. It rings once when a new approval arrives and carries a count while
// any are waiting. Opening it is the approvals inbox: everything paused on you, in the order
// to deal with it (about to expire, then oldest first, then expired), each row saying how
// long it has waited and how long is left, with "Review all" to work through them in turn.
export function ApprovalBell() {
  const { items, arrivals, opened } = useApprovals();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const now = useNow(open);
  const queue = actionable(items, now);
  const count = queue.length;
  const sections = inboxSections(items, now);
  const unread = queue.filter((i) => !opened.includes(i.runId)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const review = (index: number) => {
    setOpen(false);
    openReview(queue[index] ?? items[index]);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count ? `Approvals: ${count} waiting` : "Approvals: none waiting"}
        className={`press relative flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 ${open ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}
      >
        {/* Remounting on each arrival replays the ring exactly once. */}
        {count ? (
          <BellRing key={arrivals} aria-hidden className={`h-[18px] w-[18px] ${arrivals ? "bell-ring" : ""}`} />
        ) : (
          <Bell aria-hidden className="h-[18px] w-[18px]" />
        )}
        {count > 0 && (
          <span
            key={count}
            aria-hidden
            className="badge-pop absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-attention px-1 text-[10px] font-bold text-paper shadow-[0_0_0_2px_var(--paper)]"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Approvals"
          className="select-pop absolute top-[calc(100%+14px)] right-0 z-50 flex w-[min(400px,calc(100vw-2rem))] origin-top-right flex-col overflow-hidden rounded-[20px] border border-line bg-paper shadow-[0_24px_60px_-20px_rgb(9_9_11/0.4),0_2px_6px_-2px_rgb(9_9_11/0.08)]"
        >
          <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
            <div>
              <p className="font-display text-lg font-semibold leading-tight tracking-[-0.01em] text-ink">Approvals</p>
              <p className="mt-0.5 text-xs text-ink-2">
                {count === 0 ? "Nothing is waiting on you" : `${count} run${count === 1 ? " is" : "s are"} paused until you decide${unread ? ` · ${unread} new` : ""}`}
              </p>
            </div>
            {count > 0 && (
              <span className="num mt-0.5 rounded-full bg-attention-wash px-2 py-0.5 text-xs font-bold text-attention" aria-hidden>
                {count}
              </span>
            )}
          </header>

          {items.length === 0 ? (
            <div className="flex flex-col items-center px-6 pt-4 pb-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success-wash text-success" aria-hidden>
                <ShieldCheck className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">All caught up</p>
              <p className="mt-1 max-w-[30ch] text-xs leading-relaxed text-ink-2">When a run from any workflow needs your approval, it lands here and the bell rings.</p>
            </div>
          ) : (
            <div className="max-h-[min(460px,62dvh)] overflow-y-auto overscroll-contain border-t border-line">
              {sections.map((section) => (
                <section key={section.id} aria-label={section.title}>
                  <h3 className="sticky top-0 z-[1] bg-paper/95 px-4 pt-3 pb-1.5 text-[0.6875rem] font-semibold text-ink-3 backdrop-blur">{section.title}</h3>
                  <ul className="px-1.5 pb-1.5">
                    {section.rows.map(({ item, urgency, label }) => {
                      const isNew = !opened.includes(item.runId) && urgency !== "expired";
                      const index = queue.findIndex((q) => q.runId === item.runId);
                      return (
                        <li key={item.runId}>
                          <button
                            type="button"
                            onClick={() => (index >= 0 ? review(index) : (setOpen(false), openReview(item)))}
                            className={`press group flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-sunken ${urgency === "expired" ? "opacity-70" : ""}`}
                          >
                            <span className="relative mt-0.5 shrink-0">
                              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${urgency === "expired" ? "bg-sunken text-ink-3" : "bg-attention-wash text-attention"}`} aria-hidden>
                                <ShieldCheck className="h-4 w-4" />
                              </span>
                              {isNew && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--brick-1)] shadow-[0_0_0_2px_var(--paper)]" aria-label="New" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className={`truncate text-sm ${isNew ? "font-bold" : "font-semibold"} text-ink`}>{item.workflowName}</span>
                                <span className={`num shrink-0 rounded-full px-1.5 py-px text-[0.6875rem] font-semibold ${URGENCY_TONE[urgency]}`}>{label}</span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-ink-2">{item.step}</span>
                              {item.message && <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-ink-3">{item.message}</span>}
                              <span className="mt-1.5 flex items-center justify-between gap-2 text-[0.6875rem] text-ink-3">
                                <span>{waitingFor(item, now)}</span>
                                <span className="font-semibold text-ink opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                                  {urgency === "expired" ? "Open" : "Review"}
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {count > 0 && (
            <footer className="flex items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3">
              <p className="text-xs text-ink-2">Nothing moves until you approve.</p>
              <button type="button" onClick={() => review(0)} className="press rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-paper hover:bg-[#27272a]">
                {count === 1 ? "Review" : `Review all ${count}`}
              </button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}
