import { PAYOUT_ITEM_PROBLEM, type PaypalResourceKind } from "../paypal/types";

// The payment timeline: every PayPal object, webhook event and workflow run an owner has,
// turned into milestones on one time axis. Pure functions only, so the browser, the server
// and the tests all share one definition of "what happened when".
//
// The same fact can arrive more than once: PayPal redelivers webhooks, and an object we
// recorded ourselves is often confirmed by a webhook later. Each milestone therefore has a
// stable id built from what it is (kind + PayPal id + status), not from where it came from,
// and repeats collapse into one milestone at the earliest time anyone saw it.

export type MilestoneKind = "order" | "capture" | "refund" | "dispute" | "payout" | "invoice" | "subscription" | "run";
export type MilestoneState = "completed" | "pending" | "failed" | "refunded" | "disputed" | "payout_problem";

export const MILESTONE_STATES: Array<{ state: MilestoneState; label: string; color: string }> = [
  { state: "completed", label: "Completed", color: "#17784a" },
  { state: "pending", label: "Pending", color: "#a86400" },
  { state: "failed", label: "Failed or declined", color: "#b93a2b" },
  { state: "refunded", label: "Refunded", color: "#2c4bd6" },
  { state: "disputed", label: "Disputed", color: "#7a3e8f" },
  { state: "payout_problem", label: "Payout problem", color: "#c2410c" },
];

export const KIND_LABEL: Record<MilestoneKind, string> = {
  order: "Order",
  capture: "Capture",
  refund: "Refund",
  dispute: "Dispute",
  payout: "Payout",
  invoice: "Invoice",
  subscription: "Subscription",
  run: "Workflow run",
};

export interface Milestone {
  // Stable across refreshes and duplicate deliveries.
  id: string;
  // Everything that belongs to one payment shares this: the run that handled it, or the object itself.
  lifecycleId: string;
  kind: MilestoneKind;
  state: MilestoneState;
  // The raw PayPal or run status, e.g. "COMPLETED" or "failed".
  status: string;
  label: string;
  at: string;
  // Runs have a duration; PayPal milestones are points in time.
  endAt: string | null;
  amountMinor: string | null;
  currency: string | null;
  // Shortened so the full PayPal id never leaves the server, e.g. "…7X2KQ9".
  paypalId: string | null;
  workflowId: string | null;
  workflowName: string | null;
  runId: string | null;
  environment: "sandbox" | "live" | null;
  // Why it failed, when PayPal or the run said.
  reason: string | null;
  source: "record" | "webhook" | "run";
}

export interface PaymentTimeline {
  from: string;
  to: string;
  workflows: Array<{ id: string; name: string }>;
  milestones: Milestone[];
  // Set when a source had more records in the period than TIMELINE_LIMITS allows. The
  // newest records are kept, so the timeline is complete only from `completeSince` on.
  truncation: TimelineTruncation | null;
}

// ---------- the product limit on how much one timeline reads ----------
//
// A timeline is one bounded read per source, newest first. A merchant with more records in
// the chosen period than these limits gets the newest ones and an explicit truncation
// notice, never a silently shorter history. docs/payment-timeline.md documents the limits.
export const TIMELINE_LIMITS = { resources: 1000, events: 1000, runs: 300 } as const;
export type TimelineSource = keyof typeof TIMELINE_LIMITS;
export type TimelineLimits = Record<TimelineSource, number>;

export interface TimelineTruncation {
  // The sources that hit their limit, with the limit each one hit.
  sources: Array<{ source: TimelineSource; limit: number }>;
  // The oldest moment every source is complete from; earlier activity may be missing.
  completeSince: string;
}

// Takes the first `limit` of rows queried newest-first with `limit + 1`, and says whether
// there were more.
export function takeBounded<T>(rows: T[], limit: number): { rows: T[]; truncated: boolean } {
  return rows.length > limit ? { rows: rows.slice(0, limit), truncated: true } : { rows, truncated: false };
}

// Combines what each source's bounded read found into one notice, or null when complete.
// `oldestKept` is the time of the oldest record a truncated source still returned.
export function truncationOf(reads: Array<{ source: TimelineSource; limit: number; truncated: boolean; oldestKept: Date | null }>): TimelineTruncation | null {
  const hit = reads.filter((r) => r.truncated);
  if (hit.length === 0) return null;
  const since = Math.max(...hit.map((r) => r.oldestKept?.getTime() ?? Date.now()));
  return { sources: hit.map(({ source, limit }) => ({ source, limit })), completeSince: new Date(since).toISOString() };
}

// ---------- inputs: the stored records, reduced to the fields the timeline reads ----------

export interface ResourceInput {
  kind: PaypalResourceKind;
  paypalId: string;
  status: string;
  amountMinor: string | null;
  currency: string | null;
  workflowId: string | null;
  runId: string | null;
  environment: "sandbox" | "live";
  // For a capture: the order it paid.
  orderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventInput {
  id: string;
  eventType: string;
  resourceId: string | null;
  workflowId: string | null;
  status: string | null;
  amount: string | null;
  currency: string | null;
  reason: string | null;
  receivedAt: Date;
}

export interface RunInput {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  error: string | null;
  // The capture that started it, for runs started by a PayPal payment.
  captureId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

// ---------- status mapping ----------

const PAYOUT_PROBLEM = new Set([...PAYOUT_ITEM_PROBLEM, "UNCLAIMED"]);

const STATE_BY_KIND: Record<MilestoneKind, { completed: string[]; failed: string[]; refunded?: string[] }> = {
  order: { completed: ["APPROVED", "COMPLETED"], failed: ["VOIDED"] },
  capture: { completed: ["COMPLETED"], failed: ["DENIED", "DECLINED", "FAILED"], refunded: ["REFUNDED", "PARTIALLY_REFUNDED"] },
  refund: { completed: [], failed: ["FAILED", "CANCELLED"], refunded: ["COMPLETED"] },
  dispute: { completed: [], failed: [] },
  payout: { completed: ["SUCCESS"], failed: [] },
  invoice: { completed: ["PAID", "MARKED_AS_PAID"], failed: ["CANCELLED"], refunded: ["REFUNDED", "PARTIALLY_REFUNDED", "MARKED_AS_REFUNDED"] },
  subscription: { completed: ["ACTIVE"], failed: ["SUSPENDED", "CANCELLED", "EXPIRED", "PAYMENT_FAILED"] },
  run: { completed: ["SUCCEEDED"], failed: ["FAILED", "CANCELLED"] },
};

// Anything we don't recognise counts as pending: shown as needing attention, never as done.
export function stateOf(kind: MilestoneKind, rawStatus: string): MilestoneState {
  const status = rawStatus.toUpperCase();
  if (kind === "dispute") return "disputed";
  if (kind === "payout" && PAYOUT_PROBLEM.has(status)) return "payout_problem";
  const rules = STATE_BY_KIND[kind];
  if (rules.refunded?.includes(status)) return "refunded";
  if (rules.completed.includes(status)) return "completed";
  if (rules.failed.includes(status)) return "failed";
  return "pending";
}

const KIND_OF_RESOURCE: Record<PaypalResourceKind, MilestoneKind> = {
  order: "order",
  capture: "capture",
  refund: "refund",
  payout_batch: "payout",
  payout_item: "payout",
  invoice: "invoice",
  subscription: "subscription",
};

// Webhook events that mark a step in a payment's life, and the status each one means.
const EVENT_MILESTONES: Record<string, { kind: MilestoneKind; status: string }> = {
  "CHECKOUT.ORDER.APPROVED": { kind: "order", status: "APPROVED" },
  "PAYMENT.CAPTURE.PENDING": { kind: "capture", status: "PENDING" },
  "PAYMENT.CAPTURE.COMPLETED": { kind: "capture", status: "COMPLETED" },
  "PAYMENT.CAPTURE.DENIED": { kind: "capture", status: "DENIED" },
  "PAYMENT.CAPTURE.REFUNDED": { kind: "refund", status: "COMPLETED" },
  "CUSTOMER.DISPUTE.CREATED": { kind: "dispute", status: "OPEN" },
  "INVOICING.INVOICE.PAID": { kind: "invoice", status: "PAID" },
  "INVOICING.INVOICE.CANCELLED": { kind: "invoice", status: "CANCELLED" },
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED": { kind: "subscription", status: "PAYMENT_FAILED" },
  "BILLING.SUBSCRIPTION.CANCELLED": { kind: "subscription", status: "CANCELLED" },
  "PAYMENT.PAYOUTSBATCH.SUCCESS": { kind: "payout", status: "SUCCESS" },
  "PAYMENT.PAYOUTSBATCH.DENIED": { kind: "payout", status: "DENIED" },
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": { kind: "payout", status: "SUCCESS" },
  "PAYMENT.PAYOUTS-ITEM.FAILED": { kind: "payout", status: "FAILED" },
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED": { kind: "payout", status: "UNCLAIMED" },
};

const STATUS_WORDS: Record<string, string> = {
  APPROVED: "approved",
  COMPLETED: "completed",
  SUCCESS: "paid out",
  SUCCEEDED: "succeeded",
  PAID: "paid",
  MARKED_AS_PAID: "paid",
  PENDING: "pending",
  OPEN: "opened",
  PAYMENT_FAILED: "payment failed",
  PARTIALLY_REFUNDED: "partly refunded",
  UNCLAIMED: "not claimed",
};

export function milestoneLabel(kind: MilestoneKind, rawStatus: string): string {
  const status = rawStatus.toUpperCase();
  const words = STATUS_WORDS[status] ?? status.toLowerCase().replace(/_/g, " ");
  return `${KIND_LABEL[kind]} ${words}`;
}

// The last six characters identify an id to its owner without exposing the whole thing.
export const maskPaypalId = (id: string): string => (id.length <= 6 ? id : `…${id.slice(-6)}`);

// Milestone and lifecycle ids are built from full PayPal ids, so they are hashed before they
// leave the server. FNV-1a: stable across refreshes, which is all an id needs here.
export function opaqueId(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// ---------- building the timeline ----------

interface BuildInput {
  from: Date;
  to: Date;
  workflows: Array<{ id: string; name: string }>;
  resources: ResourceInput[];
  events: EventInput[];
  runs: RunInput[];
  truncation?: TimelineTruncation | null;
}

export function buildTimeline({ from, to, workflows, resources, events, runs, truncation = null }: BuildInput): PaymentTimeline {
  const workflowName = new Map(workflows.map((w) => [w.id, w.name]));
  const lifecycles = new LifecycleIndex(resources, runs);
  const milestones = new Map<string, Milestone>();

  const add = (m: Milestone) => {
    const existing = milestones.get(m.id);
    // A repeat keeps the earliest sighting and fills in anything the first one lacked.
    if (!existing) milestones.set(m.id, m);
    else milestones.set(m.id, mergeSightings(existing, m));
  };

  for (const r of resources) {
    const kind = KIND_OF_RESOURCE[r.kind];
    const workflowId = r.workflowId ?? lifecycles.workflowOf(r.paypalId);
    add({
      id: `${kind}:${r.paypalId}:${r.status.toUpperCase()}`,
      lifecycleId: lifecycles.of(r.paypalId),
      kind,
      state: stateOf(kind, r.status),
      status: r.status,
      label: milestoneLabel(kind, r.status),
      at: r.updatedAt.toISOString(),
      endAt: null,
      amountMinor: r.amountMinor,
      currency: r.currency,
      paypalId: maskPaypalId(r.paypalId),
      workflowId,
      workflowName: workflowId ? (workflowName.get(workflowId) ?? "Deleted workflow") : null,
      runId: r.runId ?? lifecycles.runOf(r.paypalId),
      environment: r.environment,
      reason: null,
      source: "record",
    });
  }

  for (const e of events) {
    const meaning = EVENT_MILESTONES[e.eventType];
    if (!meaning || !e.resourceId) continue;
    const workflowId = e.workflowId ?? lifecycles.workflowOf(e.resourceId);
    add({
      id: `${meaning.kind}:${e.resourceId}:${meaning.status}`,
      lifecycleId: lifecycles.of(e.resourceId),
      kind: meaning.kind,
      state: stateOf(meaning.kind, meaning.status),
      status: meaning.status,
      label: milestoneLabel(meaning.kind, meaning.status),
      at: e.receivedAt.toISOString(),
      endAt: null,
      amountMinor: null,
      currency: e.currency,
      paypalId: maskPaypalId(e.resourceId),
      workflowId,
      workflowName: workflowId ? (workflowName.get(workflowId) ?? "Deleted workflow") : null,
      runId: lifecycles.runOf(e.resourceId),
      environment: null,
      reason: e.reason,
      source: "webhook",
    });
  }

  for (const run of runs) {
    add({
      id: `run:${run.id}`,
      lifecycleId: `run:${run.id}`,
      kind: "run",
      state: stateOf("run", run.status),
      status: run.status,
      label: milestoneLabel("run", run.status),
      at: run.startedAt.toISOString(),
      // A run still going is drawn up to now.
      endAt: (run.finishedAt ?? to).toISOString(),
      amountMinor: null,
      currency: null,
      paypalId: null,
      workflowId: run.workflowId,
      workflowName: workflowName.get(run.workflowId) ?? run.workflowName,
      runId: run.id,
      environment: null,
      reason: run.error,
      source: "run",
    });
  }

  const inRange = [...milestones.values()].map(withOpaqueIds).filter((m) => {
    const at = Date.parse(m.at);
    return at >= from.getTime() && at <= to.getTime();
  });
  inRange.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  return { from: from.toISOString(), to: to.toISOString(), workflows, milestones: inRange, truncation };
}

const withOpaqueIds = (m: Milestone): Milestone => ({ ...m, id: `${m.kind}-${opaqueId(m.id)}`, lifecycleId: opaqueId(m.lifecycleId) });

function mergeSightings(first: Milestone, second: Milestone): Milestone {
  const [earlier, later] = first.at <= second.at ? [first, second] : [second, first];
  return {
    ...earlier,
    amountMinor: earlier.amountMinor ?? later.amountMinor,
    currency: earlier.currency ?? later.currency,
    workflowId: earlier.workflowId ?? later.workflowId,
    workflowName: earlier.workflowName ?? later.workflowName,
    runId: earlier.runId ?? later.runId,
    environment: earlier.environment ?? later.environment,
    reason: earlier.reason ?? later.reason,
  };
}

// Works out which payment each PayPal object belongs to. A run that a capture started, and
// every object that run created (payouts, refunds), form one lifecycle; so does the order
// that capture paid. Anything not linked to a run is its own lifecycle.
class LifecycleIndex {
  private runByPaypalId = new Map<string, string>();
  private workflowByPaypalId = new Map<string, string>();

  constructor(resources: ResourceInput[], runs: RunInput[]) {
    for (const run of runs) {
      if (!run.captureId) continue;
      this.runByPaypalId.set(run.captureId, run.id);
      this.workflowByPaypalId.set(run.captureId, run.workflowId);
    }
    for (const r of resources) {
      const run = r.runId ?? this.runByPaypalId.get(r.paypalId);
      if (run) this.runByPaypalId.set(r.paypalId, run);
      if (r.workflowId) this.workflowByPaypalId.set(r.paypalId, r.workflowId);
    }
    // An order joins the lifecycle of the capture that paid it.
    for (const r of resources) {
      if (r.kind !== "capture" || !r.orderId) continue;
      const run = this.runByPaypalId.get(r.paypalId);
      if (run && !this.runByPaypalId.has(r.orderId)) this.runByPaypalId.set(r.orderId, run);
    }
  }

  runOf(paypalId: string): string | null {
    return this.runByPaypalId.get(paypalId) ?? null;
  }

  workflowOf(paypalId: string): string | null {
    return this.workflowByPaypalId.get(paypalId) ?? null;
  }

  of(paypalId: string): string {
    const run = this.runOf(paypalId);
    return run ? `run:${run}` : `paypal:${paypalId}`;
  }
}
