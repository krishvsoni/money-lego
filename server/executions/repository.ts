import "server-only";
import type { ObjectId, UpdateFilter } from "mongodb";
import type { ExecutionDTO } from "@/lib/dto";
import { canTransition, type ExecutionState } from "@/lib/execution-states";
import type { SessionUser } from "../auth/session";
import { collections } from "../db/collections";
import type { ExecutionDoc, TimelineEvent } from "../db/types";
import { errors } from "../errors";
import { parseId } from "../db/ids";

const TIMELINE_LIMIT = 50;

export async function findOwnedExecution(user: SessionUser, id: string): Promise<ExecutionDoc> {
  const { executions } = await collections();
  const doc = await executions.findOne({ _id: parseId(id, "Run"), ownerId: user.userId });
  if (!doc) throw errors.notFound("Run");
  return doc;
}

export interface Transition {
  to?: ExecutionState;
  set?: Partial<ExecutionDoc>;
  note?: string;
  source?: TimelineEvent["source"];
  extra?: UpdateFilter<ExecutionDoc>;
}

// Compare-and-set on the document version. Two instances (say, a webhook and a user's
// refresh) can race on the same run; only the one that read the latest version wins, and
// the loser gets null back and re-reads. State changes are checked against the machine.
export async function casUpdate(doc: ExecutionDoc, t: Transition): Promise<ExecutionDoc | null> {
  const to = t.to ?? doc.state;
  if (to !== doc.state && !canTransition(doc.state, to)) {
    throw errors.invalidState(`A run can't move from ${doc.state} to ${to}.`);
  }
  const now = new Date();
  const update: UpdateFilter<ExecutionDoc> = {
    ...t.extra,
    $set: { ...(t.extra?.$set ?? {}), ...t.set, state: to, updatedAt: now },
    $inc: { ...(t.extra?.$inc ?? {}), version: 1 },
  };
  if (to !== doc.state || t.note) {
    const event: TimelineEvent = { at: now, state: to, note: t.note ?? "", source: t.source ?? "app" };
    update.$push = { ...(t.extra?.$push ?? {}), timeline: { $each: [event], $slice: -TIMELINE_LIMIT } } as UpdateFilter<ExecutionDoc>["$push"];
  }
  const { executions } = await collections();
  return executions.findOneAndUpdate({ _id: doc._id, version: doc.version }, update, { returnDocument: "after" });
}

// Re-reads and re-applies on version conflict. `plan` sees the freshest document each time,
// so its decision is always based on current state, and may return null to do nothing.
export async function updateWithRetry(
  id: ObjectId,
  plan: (doc: ExecutionDoc) => Transition | null,
  attempts = 4,
): Promise<ExecutionDoc> {
  const { executions } = await collections();
  for (let i = 0; i < attempts; i++) {
    const doc = await executions.findOne({ _id: id });
    if (!doc) throw errors.notFound("Run");
    const t = plan(doc);
    if (!t) return doc;
    const next = await casUpdate(doc, t);
    if (next) return next;
  }
  throw errors.staleWrite();
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toExecutionDTO(doc: ExecutionDoc): ExecutionDTO {
  return {
    id: doc._id.toHexString(),
    workflowRunId: doc.source?.workflowRunId.toHexString() ?? null,
    recipeId: doc.recipeId.toHexString(),
    recipeName: doc.recipeName,
    recipeVersion: doc.recipeVersion,
    state: doc.state,
    sourceWallet: doc.sourceWallet,
    amountRaw: doc.amountRaw,
    config: doc.snapshot,
    providerTransferId: doc.providerTransferId,
    supportBundleId: doc.supportBundleId,
    providerStatus: doc.providerStatus,
    providerPhase: doc.providerPhase,
    progress: doc.progress,
    quote: doc.quote ? { ...doc.quote, quotedAt: doc.quote.quotedAt.toISOString(), expiresAt: iso(doc.quote.expiresAt) } : null,
    signatures: doc.signatures.map((s) => ({ ...s, recordedAt: s.recordedAt.toISOString() })),
    destinations: doc.destinations.map((d) => ({ ...d, paidAt: iso(d.paidAt) })),
    timeline: doc.timeline.map((e) => ({ ...e, at: e.at.toISOString() })),
    lastError: doc.lastError ? { ...doc.lastError, at: doc.lastError.at.toISOString() } : null,
    shareToken: doc.shareToken,
    lastCheckedAt: iso(doc.lastCheckedAt),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
