import type { PendingApproval } from "./approvals-store";

// How the inbox talks about time: how long a run has been waiting on you, and how long you
// have left before the approval expires and the run takes its expiry path.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const SOON_MS = 6 * HOUR;

function span(ms: number): string {
  if (ms < MIN) return "under a minute";
  if (ms < HOUR) return `${Math.round(ms / MIN)} min`;
  if (ms < DAY) {
    const h = Math.round(ms / HOUR);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round(ms / DAY);
  return `${d} day${d === 1 ? "" : "s"}`;
}

export function waitingFor(item: PendingApproval, now = Date.now()): string {
  return `Waiting ${span(Math.max(0, now - new Date(item.startedAt).getTime()))}`;
}

export type Urgency = "expired" | "soon" | "ok" | "none";

export function expiry(item: PendingApproval, now = Date.now()): { urgency: Urgency; label: string } {
  if (!item.until) return { urgency: "none", label: "No time limit" };
  const left = new Date(item.until).getTime() - now;
  if (left <= 0) return { urgency: "expired", label: "Expired" };
  return { urgency: left < SOON_MS ? "soon" : "ok", label: `${span(left)} left` };
}

export const URGENCY_TONE: Record<Urgency, string> = {
  expired: "bg-sunken text-ink-3",
  soon: "bg-danger-wash text-danger",
  ok: "bg-attention-wash text-attention",
  none: "bg-sunken text-ink-2",
};

// The inbox in the order you should deal with it: what's about to expire first (soonest
// first), then everything else oldest first so long-forgotten runs don't sink, then the
// expired ones, which can only be opened.
export function inboxSections(items: PendingApproval[], now = Date.now()) {
  const withMeta = items.map((item) => ({ item, ...expiry(item, now) }));
  const until = (i: PendingApproval) => new Date(i.until ?? 0).getTime();
  const started = (i: PendingApproval) => new Date(i.startedAt).getTime();
  const soon = withMeta.filter((x) => x.urgency === "soon").sort((a, b) => until(a.item) - until(b.item));
  const waiting = withMeta.filter((x) => x.urgency === "ok" || x.urgency === "none").sort((a, b) => started(a.item) - started(b.item));
  const expired = withMeta.filter((x) => x.urgency === "expired").sort((a, b) => until(b.item) - until(a.item));
  return [
    { id: "soon", title: "Expiring soon", rows: soon },
    { id: "waiting", title: "Waiting on you", rows: waiting },
    { id: "expired", title: "Expired", rows: expired },
  ].filter((s) => s.rows.length > 0);
}

// The approvals you can still act on, in inbox order: what "Review all" steps through.
export function actionable(items: PendingApproval[], now = Date.now()): PendingApproval[] {
  return inboxSections(items, now)
    .filter((s) => s.id !== "expired")
    .flatMap((s) => s.rows.map((r) => r.item));
}
