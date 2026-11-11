import "server-only";
import { z } from "zod";
import {
  buildTimeline, KIND_LABEL, MILESTONE_STATES, takeBounded, TIMELINE_LIMITS, truncationOf,
  type Milestone, type MilestoneKind, type MilestoneState, type PaymentTimeline, type TimelineLimits,
} from "@/lib/payments/timeline";
import { boundDateRange } from "@/lib/payments/timeline-view";
import { formatMoney, referenceFor } from "@/lib/paypal/types";
import type { SessionUser } from "../auth/session";
import { askJson, ownerTag, redact } from "../ai/model";
import { collections } from "../db/collections";

// The payments timeline for one owner. Every query below is filtered to the signed-in
// owner's records; the pure mapping lives in lib/payments/timeline.ts.

export const TIMELINE_RANGES = [7, 30, 90] as const;
export type TimelineRange = (typeof TIMELINE_RANGES)[number];

const CAPTURE_RUN_KEY = "paypal:capture:";

// Each source is one bounded read, newest first, asking for one record more than its limit so
// a cut-off history is reported (PaymentTimeline.truncation) rather than shown as complete.
// `limits` is only overridden by tests.
export async function paymentTimeline(user: SessionUser, days: TimelineRange, limits: TimelineLimits = TIMELINE_LIMITS): Promise<PaymentTimeline> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const { workflows, paypalResources, paypalEvents, workflowRuns } = await collections();

  const [flows, resourceRows, runRows] = await Promise.all([
    workflows.find({ ownerId: user.userId }, { projection: { _id: 1, name: 1, webhookKey: 1 } }).toArray(),
    paypalResources.find({ ownerId: user.userId, updatedAt: { $gte: from } }).sort({ updatedAt: -1, _id: -1 }).limit(limits.resources + 1).toArray(),
    workflowRuns.find({ ownerId: user.userId, startedAt: { $gte: from } }, { projection: { graph: 0, log: 0 } }).sort({ startedAt: -1, _id: -1 }).limit(limits.runs + 1).toArray(),
  ]);
  const { rows: resources, truncated: resourcesTruncated } = takeBounded(resourceRows, limits.resources);
  const { rows: runs, truncated: runsTruncated } = takeBounded(runRows, limits.runs);

  // Webhook events aren't stored per owner; one is ours when it is about an object we own,
  // was routed to one of our workflows, or carries one of our workflows' references.
  const eventRows = await paypalEvents
    .find({
      receivedAt: { $gte: from },
      $or: [
        { resourceId: { $in: resources.map((r) => r.paypalId) } },
        { "routed.workflowId": { $in: flows.map((w) => w._id) } },
        { reference: { $in: flows.map((w) => referenceFor(w.webhookKey)) } },
      ],
    })
    .sort({ receivedAt: -1, _id: -1 })
    .limit(limits.events + 1)
    .toArray();
  const { rows: events, truncated: eventsTruncated } = takeBounded(eventRows, limits.events);

  const truncation = truncationOf([
    { source: "resources", limit: limits.resources, truncated: resourcesTruncated, oldestKept: resources.at(-1)?.updatedAt ?? null },
    { source: "events", limit: limits.events, truncated: eventsTruncated, oldestKept: events.at(-1)?.receivedAt ?? null },
    { source: "runs", limit: limits.runs, truncated: runsTruncated, oldestKept: runs.at(-1)?.startedAt ?? null },
  ]);

  return buildTimeline({
    from,
    to,
    truncation,
    workflows: flows.map((w) => ({ id: w._id.toHexString(), name: w.name })),
    resources: resources.map((r) => ({
      kind: r.kind,
      paypalId: r.paypalId,
      status: r.status,
      amountMinor: r.amountMinor,
      currency: r.currency,
      workflowId: r.workflowId?.toHexString() ?? null,
      runId: r.runId?.toHexString() ?? null,
      environment: r.environment,
      orderId: typeof r.detail.orderId === "string" ? r.detail.orderId : null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    events: events.map((e) => ({
      id: e._id,
      eventType: e.eventType,
      resourceId: e.resourceId,
      workflowId: e.routed[0]?.workflowId.toHexString() ?? null,
      status: typeof e.summary.status === "string" ? e.summary.status : null,
      amount: typeof e.summary.amount === "string" ? e.summary.amount : null,
      currency: typeof e.summary.currency === "string" ? e.summary.currency : null,
      reason: typeof e.summary.reason === "string" ? e.summary.reason : null,
      receivedAt: e.receivedAt,
    })),
    runs: runs.map((r) => ({
      id: r._id.toHexString(),
      workflowId: r.workflowId.toHexString(),
      workflowName: r.workflowName,
      status: r.status,
      error: r.error,
      captureId: r.trigger.key.startsWith(CAPTURE_RUN_KEY) ? r.trigger.key.slice(CAPTURE_RUN_KEY.length) : null,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    })),
  });
}

// ---------- AI questions about the timeline ----------
//
// Read-only by construction: the model gets a redacted list of milestones and may answer
// only with a summary, a filter for the timeline and the ids of milestones to highlight.
// It has no tools, so it can't start, refund or pay anything.

export interface TimelineAnswer {
  summary: string;
  filter: { states: MilestoneState[]; kinds: MilestoneKind[]; workflowIds: string[]; from: string | null; to: string | null };
  milestoneIds: string[];
}

const STATES = MILESTONE_STATES.map((s) => s.state) as [MilestoneState, ...MilestoneState[]];
const KINDS = Object.keys(KIND_LABEL) as [MilestoneKind, ...MilestoneKind[]];
const MAX_FACTS = 300;

const answerSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  filter: z
    .object({
      states: z.array(z.enum(STATES)).max(STATES.length).default([]),
      kinds: z.array(z.enum(KINDS)).max(KINDS.length).default([]),
      workflowIds: z.array(z.string()).max(20).default([]),
      from: z.string().nullable().default(null),
      to: z.string().nullable().default(null),
    })
    .default({ states: [], kinds: [], workflowIds: [], from: null, to: null }),
  milestoneIds: z.array(z.string()).max(50).default([]),
});

const SYSTEM = `You answer questions about a merchant's PayPal payment timeline in Money Lego.
You get the milestones in the period (one per line) and the merchant's workflows.
Answer only from these facts; if they don't contain the answer, say so plainly.
Reply as JSON: {"summary": string, "filter": {"states": string[], "kinds": string[], "workflowIds": string[], "from": ISO date or null, "to": ISO date or null}, "milestoneIds": string[]}.
- summary: two to five short sentences for the merchant, with counts and amounts where useful. No markdown.
- filter: narrows the timeline to what the question is about. Use empty arrays and nulls for "everything".
  states: ${STATES.join(", ")}. kinds: ${KINDS.join(", ")}.
- milestoneIds: up to 50 ids of the milestones the answer is about, copied exactly.
You can only describe and filter. Never offer to take an action.`;

function factLine(m: Milestone): string {
  const amount = m.amountMinor ? formatMoney(m.amountMinor, m.currency) : "";
  const reason = m.reason ? `reason: ${String(redact(m.reason)).slice(0, 160)}` : "";
  return [m.id, m.at, m.kind, m.state, m.label, amount, m.workflowName ?? "no workflow", m.paypalId ?? "", reason].filter(Boolean).join(" | ");
}

export async function askTimeline(user: SessionUser, question: string, days: TimelineRange): Promise<TimelineAnswer> {
  const timeline = await paymentTimeline(user, days);
  const recent = timeline.milestones.slice(-MAX_FACTS);
  const facts = [
    `Now: ${timeline.to}. Period: ${timeline.from} to ${timeline.to}.${timeline.milestones.length > MAX_FACTS ? ` Only the latest ${MAX_FACTS} of ${timeline.milestones.length} milestones are listed.` : ""}`,
    ...(timeline.truncation
      ? [`The history is incomplete: this merchant has more activity than the timeline reads, so it is complete only from ${timeline.truncation.completeSince}. Say so if the question is about anything earlier.`]
      : []),
    `Workflows (id | name): ${timeline.workflows.map((w) => `${w.id} | ${String(redact(w.name))}`).join("; ") || "none"}`,
    "Milestones (id | time | kind | state | label | amount | workflow | PayPal id | reason):",
    ...(recent.length ? recent.map(factLine) : ["none"]),
  ].join("\n");

  const answer = await askJson({
    system: SYSTEM,
    user: `${facts}\n\nQuestion:\n"""\n${question}\n"""`,
    schema: answerSchema,
    tag: ownerTag(user.userId),
  });

  return checkAnswer(answer, timeline);
}

// The model's ids and dates are checked against what really exists before the page uses them:
// ids must be known, and dates must lie in the period the timeline was built for.
export function checkAnswer(answer: z.infer<typeof answerSchema>, timeline: Pick<PaymentTimeline, "from" | "to" | "workflows" | "milestones">): TimelineAnswer {
  const knownWorkflows = new Set(timeline.workflows.map((w) => w.id));
  const knownMilestones = new Set(timeline.milestones.map((m) => m.id));
  const range = boundDateRange(answer.filter.from, answer.filter.to, timeline);
  return {
    summary: answer.summary,
    filter: {
      states: answer.filter.states,
      kinds: answer.filter.kinds,
      workflowIds: answer.filter.workflowIds.filter((id) => knownWorkflows.has(id)),
      from: range.from,
      to: range.to,
    },
    milestoneIds: answer.milestoneIds.filter((id) => knownMilestones.has(id)),
  };
}
