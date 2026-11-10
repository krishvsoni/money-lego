"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, ShieldCheck, X } from "lucide-react";
import { BlurSwap } from "@/components/ui/blur-swap";
import { Button, ButtonLink } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api-client";
import type { RunDTO } from "@/lib/workflow/dto";
import { ApprovalReview } from "@/features/workflows/editor/approval-review";
import { useNow } from "./approval-bell";
import { actionable, expiry, URGENCY_TONE, waitingFor } from "./approval-meta";
import { closeReview, openReview, refreshApprovals, snooze, useApprovals, type PendingApproval } from "./approvals-store";

// The approval inbox follows you around the app. When a run from any workflow pauses on a
// Human approval, a notice slides in at the top-right corner of whatever page you're on and
// the bell in the nav rings. Review opens the same review the editor shows (recipients,
// amounts, AI risk check, fingerprint) with Approve and Reject, and steps through every
// approval still waiting, so a payout never sits because you were looking at another page.
// On the waiting run's own editor page the notice stays away: the run panel already shows it.

interface Queue {
  position: number; // 1-based place of this approval among those you can still act on; 0 if not in it
  total: number;
  prev: PendingApproval | null;
  next: PendingApproval | null;
}

function ReviewDialog({ item, queue, onClose, onDecided, onGo }: { item: PendingApproval; queue: Queue; onClose: () => void; onDecided: () => void; onGo: (item: PendingApproval) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const now = useNow(true, 30_000);
  const [run, setRun] = useState<RunDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The decision shows the moment it's made; `confirmed` flips once the server has it.
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // What to offer next, taken from the queue as it was when you decided.
  const [after, setAfter] = useState<PendingApproval | null>(null);
  const { urgency, label } = expiry(item, now);
  const expired = urgency === "expired";

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ run: RunDTO }>(`/api/workflow-runs/${item.runId}`)
      .then((res) => !cancelled && setRun(res.run))
      .catch((e) => !cancelled && setLoadError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [item.runId]);

  const decide = async (decision: "approved" | "rejected") => {
    if (done || expired) return;
    setDone(decision);
    setAfter(queue.next ?? queue.prev);
    setError(null);
    try {
      await api(`/api/workflow-runs/${item.runId}/approve`, { method: "POST", body: { nodeId: item.nodeId, decision } });
      setConfirmed(true);
      onDecided();
    } catch (e) {
      // The server refused (already decided, expired): undo the optimistic state and say why.
      setDone(null);
      setAfter(null);
      setError(errorMessage(e));
    }
  };

  const editor = `/workflows/${item.workflowId}`;
  const iconTone = done === "approved" ? "bg-success-wash text-success" : done === "rejected" ? "bg-sunken text-ink-2" : expired ? "bg-sunken text-ink-3" : "bg-attention-wash text-attention";
  const title = done === "approved" ? "Approved" : done === "rejected" ? "Rejected" : expired ? "This approval expired" : "Needs your approval";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="approval-title"
      className="stage-dialog"
      data-size="compact"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {/* Where you are in the queue, with a way back and forward. */}
      {queue.total > 1 && !done && (
        <nav aria-label="Approvals queue" className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5 sm:px-7">
          <span className="num text-xs font-semibold text-ink-3">{queue.position > 0 ? `${queue.position} of ${queue.total} waiting` : `${queue.total} waiting`}</span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={() => queue.prev && onGo(queue.prev)}
              disabled={!queue.prev}
              aria-label="Previous approval"
              className="press rounded-full p-1.5 text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => queue.next && onGo(queue.next)}
              disabled={!queue.next}
              aria-label="Next approval"
              className="press rounded-full p-1.5 text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </span>
        </nav>
      )}

      <header className="flex items-start gap-3 px-5 pt-5 pb-3 sm:px-7">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 ${iconTone}`} aria-hidden>
          {done === "approved" ? <CircleCheck key="ok" className="decide-pop h-5 w-5" /> : done === "rejected" ? <CircleX key="no" className="decide-pop h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="approval-title" className={`headline text-2xl leading-tight transition-colors duration-200 ${done === "approved" ? "text-success" : ""}`}>
            <BlurSwap text={title} />
          </h2>
          <p className="mt-0.5 truncate text-sm text-ink-2">
            {item.workflowName} · {item.step}
          </p>
          {!done && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              <span className={`num rounded-full px-1.5 py-px font-semibold ${URGENCY_TONE[urgency]}`}>{label}</span>
              <span>{waitingFor(item, now)}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="press -mr-1 rounded-full p-2 text-ink-2 hover:bg-sunken hover:text-ink">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {done ? (
        <div className="stage-swap flex flex-col gap-4 px-5 pb-6 sm:px-7">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink-3" role="status">
            <span className={`h-1.5 w-1.5 rounded-full ${confirmed ? "bg-success" : "pulse-dot bg-ink-3"}`} aria-hidden />
            <BlurSwap text={confirmed ? "Saved. The run has moved on." : "Sending your decision…"} />
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            {done === "approved"
              ? "The run is carrying on with exactly what you approved. Each PayPal action re-checks the fingerprint before it touches PayPal."
              : "The run took its Rejected branch. Nothing on the Approved branch will happen."}
          </p>
          {after && (
            <button type="button" onClick={() => onGo(after)} className="press group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:border-line-strong">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-attention-wash text-attention" aria-hidden>
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-ink-3">Next approval</span>
                <span className="block truncate text-sm font-semibold text-ink">
                  {after.workflowName} · {after.step}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
            </button>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Link href={editor} onClick={onClose} className="press inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-ink hover:bg-sunken">
              Open the run
            </Link>
            <Button variant={after ? "secondary" : "primary"} onClick={onClose}>
              {after ? "Done for now" : "Done"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pb-4 sm:px-7">
            {expired && (
              <p className="mb-3 rounded-xl bg-sunken px-3.5 py-3 text-sm leading-relaxed text-ink-2">
                The time to decide ran out, so this run can&apos;t be approved anymore. It takes its expiry path the next time the scheduler checks it. Open the run to see what happened.
              </p>
            )}
            {item.message && <p className="max-w-[70ch] text-sm leading-relaxed text-ink">{item.message}</p>}
            {run ? (
              <ApprovalReview run={run} nodeId={item.nodeId} />
            ) : loadError ? (
              <p role="alert" className="mt-3 text-sm text-danger">
                {loadError}
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2" aria-busy aria-label="Loading the review">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="build-ghost h-12 rounded-lg" style={{ ["--i" as string]: i }} />
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm font-semibold text-danger">
                {error}
              </p>
            )}
          </div>
          {/* The decision stays in reach however long the review is. */}
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/95 px-5 py-3.5 backdrop-blur sm:px-7">
            <Link href={editor} onClick={onClose} className="text-sm font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
              Open in editor
            </Link>
            {expired ? (
              <ButtonLink href={editor}>Open the run</ButtonLink>
            ) : (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => decide("rejected")} disabled={!run}>
                  Reject
                </Button>
                <Button onClick={() => decide("approved")} disabled={!run}>
                  Approve
                </Button>
              </div>
            )}
          </footer>
        </>
      )}
    </dialog>
  );
}

// `edge` sits the notice against the top of the window (the editor has no nav); `nav` keeps
// it clear of the floating nav bar.
export function ApprovalInbox({ placement = "nav" }: { placement?: "nav" | "edge" }) {
  const pathname = usePathname();
  const { items, later, review } = useApprovals();
  const now = useNow(true);
  // The notice slides back out before "Later" hides it.
  const [leaving, setLeaving] = useState<string | null>(null);

  // What you can still act on, most urgent first. Expired ones live only in the bell's inbox.
  const queue = actionable(items, now);
  const visible = queue.filter((i) => !later.includes(i.runId) && pathname !== `/workflows/${i.workflowId}`);
  const first = visible[0];
  const at = review ? queue.findIndex((q) => q.runId === review.runId) : -1;
  const reviewQueue: Queue = {
    position: at + 1,
    total: queue.length,
    prev: at > 0 ? queue[at - 1] : null,
    next: at >= 0 ? (queue[at + 1] ?? null) : (queue[0] ?? null),
  };

  const dismiss = (runId: string) => {
    setLeaving(runId);
    setTimeout(() => {
      snooze(runId);
      setLeaving(null);
    }, 220);
  };

  return (
    <>
      {first && !review && (
        <div
          key={first.runId}
          role="status"
          aria-live="polite"
          data-leaving={leaving === first.runId ? "" : undefined}
          className={`approval-toast fixed right-4 z-[60] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_60px_-20px_rgb(9_9_11/0.4),0_2px_6px_-2px_rgb(9_9_11/0.08)] sm:right-6 ${
            placement === "nav" ? "top-[96px]" : "top-4"
          }`}
        >
          {/* A thin amber edge says "needs you" without shouting. */}
          <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-attention" />
          <div className="flex items-start gap-3 py-3 pr-3 pl-4">
            <span className="toast-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-attention-wash text-attention" aria-hidden>
              <ShieldCheck className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-bold leading-tight text-ink">
                Needs your approval
                {visible.length > 1 && <span className="rounded-full bg-sunken px-1.5 py-px text-[0.6875rem] font-semibold text-ink-2">+{visible.length - 1} more</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-2">
                {first.workflowName} · {first.step}
              </p>
              {first.message && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">{first.message}</p>}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className={`num rounded-full px-1.5 py-px text-[0.6875rem] font-semibold ${URGENCY_TONE[expiry(first, now).urgency]}`}>{expiry(first, now).label}</span>
                <span className="flex gap-1.5">
                  <Button variant="quiet" className="h-8 px-3 text-xs" onClick={() => dismiss(first.runId)}>
                    Later
                  </Button>
                  <Button className="h-8 px-3.5 text-xs" onClick={() => openReview(first)}>
                    {visible.length > 1 ? `Review ${visible.length}` : "Review"}
                  </Button>
                </span>
              </div>
            </div>
            <button type="button" onClick={() => dismiss(first.runId)} aria-label="Dismiss" className="press -mt-1 -mr-1 rounded-full p-1.5 text-ink-3 hover:bg-sunken hover:text-ink">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
      {review && <ReviewDialog key={review.runId} item={review} queue={reviewQueue} onClose={closeReview} onDecided={refreshApprovals} onGo={openReview} />}
    </>
  );
}
