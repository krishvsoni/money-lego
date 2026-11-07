import "server-only";
import { ObjectId } from "mongodb";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { NodeRunStatus, RunStatus, WaitKind } from "@/lib/workflow/types";
import { nextRunAt } from "@/lib/workflow/schedule";
import { validateGraph } from "@/lib/workflow/validate";
import type { SessionUser } from "../auth/session";
import { collections, isDuplicateKeyError } from "../db/collections";
import { parseId } from "../db/ids";
import { inTransaction } from "../db/transaction";
import type { WorkflowDoc, WorkflowRunDoc } from "../db/types";
import { errors } from "../errors";
import { advanceRun } from "./advance";

export interface NodeRunDTO {
  nodeId: string;
  nodeType: string;
  status: NodeRunStatus;
  port: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
  attempts: number;
  waitState: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunDTO {
  id: string;
  workflowId: string;
  workflowVersion: number;
  status: RunStatus;
  trigger: { type: string; at: string };
  waiting: { nodeId: string; kind: WaitKind; until: string | null; ref: string | null } | null;
  error: string | null;
  log: Array<{ at: string; nodeId: string | null; level: string; message: string }>;
  startedAt: string;
  finishedAt: string | null;
  nodes?: NodeRunDTO[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function toRunDTO(r: WorkflowRunDoc): RunDTO {
  return {
    id: r._id.toHexString(),
    workflowId: r.workflowId.toHexString(),
    workflowVersion: r.workflowVersion,
    status: r.status,
    trigger: { type: r.trigger.type, at: r.trigger.at.toISOString() },
    waiting: r.waiting ? { ...r.waiting, until: iso(r.waiting.until) } : null,
    error: r.error,
    log: r.log.map((l) => ({ ...l, at: l.at.toISOString() })),
    startedAt: r.startedAt.toISOString(),
    finishedAt: iso(r.finishedAt),
  };
}

// One trigger delivery, one run. `key` identifies the delivery (a webhook's idempotency
// key, a schedule slot, a client request id); repeating it returns the existing run.
export async function createRun(workflow: WorkflowDoc, trigger: { type: string; key: string; payload: unknown }): Promise<{ run: WorkflowRunDoc; created: boolean }> {
  const issues = validateGraph(workflow.graph);
  if (issues.length) throw errors.validation(`This workflow has ${issues.length} problem${issues.length > 1 ? "s" : ""} to fix first: ${issues[0].message}`);
  const { workflowRuns, workflows } = await collections();
  const now = new Date();
  const run: WorkflowRunDoc = {
    _id: new ObjectId(),
    ownerId: workflow.ownerId,
    workflowId: workflow._id,
    workflowName: workflow.name,
    workflowVersion: workflow.currentVersion,
    graph: workflow.graph,
    trigger: { ...trigger, at: now },
    status: "queued",
    waiting: null,
    log: [{ at: now, nodeId: null, level: "info", message: `Started by ${trigger.type.replace("trigger.", "")} trigger on version ${workflow.currentVersion}.` }],
    error: null,
    lease: null,
    nextWakeAt: now,
    version: 0,
    startedAt: now,
    finishedAt: null,
    updatedAt: now,
  };
  try {
    await inTransaction(async (session) => {
      await workflowRuns.insertOne(run, { session });
      await workflows.updateOne({ _id: workflow._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: now } }, { session });
    });
    return { run, created: true };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await workflowRuns.findOne({ workflowId: workflow._id, "trigger.key": trigger.key });
    if (!existing) throw error;
    return { run: existing, created: false };
  }
}

async function ownedRun(user: SessionUser, id: string): Promise<WorkflowRunDoc> {
  const { workflowRuns } = await collections();
  const run = await workflowRuns.findOne({ _id: parseId(id, "Run"), ownerId: user.userId });
  if (!run) throw errors.notFound("Run");
  return run;
}

export async function getRunDetail(user: SessionUser, id: string, advanceIfDue: boolean): Promise<RunDTO> {
  let run = await ownedRun(user, id);
  if (advanceIfDue && run.nextWakeAt && run.nextWakeAt <= new Date()) {
    await advanceRun(run._id, 8_000);
    run = await ownedRun(user, id);
  }
  const { nodeRuns } = await collections();
  const nodes = await nodeRuns.find({ runId: run._id }).toArray();
  return {
    ...toRunDTO(run),
    nodes: nodes.map((n) => ({
      nodeId: n.nodeId,
      nodeType: n.nodeType,
      status: n.status,
      port: n.port,
      input: n.input,
      output: n.output,
      error: n.error,
      attempts: n.attempts,
      waitState: n.waitState,
      startedAt: iso(n.startedAt),
      finishedAt: iso(n.finishedAt),
    })),
  };
}

export async function listRuns(user: SessionUser, workflowId: string): Promise<RunDTO[]> {
  const { workflowRuns } = await collections();
  const runs = await workflowRuns.find({ ownerId: user.userId, workflowId: parseId(workflowId, "Workflow") }, { projection: { graph: 0 } }).sort({ startedAt: -1 }).limit(30).toArray();
  return runs.map((r) => toRunDTO(r as WorkflowRunDoc));
}

export async function decideApproval(user: SessionUser, runId: string, nodeId: string, decision: "approved" | "rejected"): Promise<RunDTO> {
  const run = await ownedRun(user, runId);
  const { nodeRuns, workflowRuns } = await collections();
  const result = await nodeRuns.updateOne(
    { runId: run._id, nodeId, status: "waiting", nodeType: "logic.approval", "waitState.decision": { $exists: false } },
    { $set: { "waitState.decision": decision, "waitState.by": user.name, "waitState.at": new Date().toISOString() } },
  );
  if (!result.modifiedCount) throw errors.invalidState("This approval was already decided or isn't waiting anymore.");
  await workflowRuns.updateOne({ _id: run._id }, { $set: { nextWakeAt: new Date() } });
  await advanceRun(run._id, 15_000);
  return getRunDetail(user, runId, false);
}

export async function cancelRun(user: SessionUser, runId: string): Promise<RunDTO> {
  const run = await ownedRun(user, runId);
  if (!["queued", "running", "waiting"].includes(run.status)) throw errors.invalidState("This run already finished.");
  const { workflowRuns, nodeRuns, paypalResources } = await collections();
  const funded = await paypalResources.countDocuments({ runId: run._id, kind: "payout_batch", status: { $nin: ["SUCCESS", "DENIED", "CANCELED"] } });
  const now = new Date();
  await nodeRuns.updateMany({ runId: run._id, status: { $in: ["pending", "running", "waiting"] } }, { $set: { status: "cancelled", finishedAt: now } });
  const note = funded ? "Run cancelled. A PayPal payout batch was already submitted and keeps processing at PayPal; track it on the Payments page." : "Run cancelled. Nothing further will be sent.";
  await workflowRuns.updateOne(
    { _id: run._id },
    { $set: { status: "cancelled", waiting: null, nextWakeAt: null, finishedAt: now, updatedAt: now }, $inc: { version: 1 }, $push: { log: { $each: [{ at: now, nodeId: null, level: "warn", message: note }], $slice: -200 } } },
  );
  return getRunDetail(user, runId, false);
}

// Retries from the failed node. Nodes that can repeat an outside effect (HTTP, Discord,
// Slack) need explicit confirmation; PayPal nodes send an idempotency key per run and
// node, so a retry gets PayPal's first result instead of acting twice.
export async function retryRun(user: SessionUser, runId: string, confirmSideEffects: boolean): Promise<RunDTO> {
  const run = await ownedRun(user, runId);
  if (run.status !== "failed") throw errors.invalidState("Only failed runs can be retried.");
  const { nodeRuns, workflowRuns } = await collections();
  const failed = await nodeRuns.findOne({ runId: run._id, status: "failed" });
  if (!failed) throw errors.invalidState("There's no failed step to retry.");
  const def = nodeDefinition(failed.nodeType);
  if (def && !def.retrySafe && !confirmSideEffects) {
    throw errors.conflict(`${def.title} may already have happened once. Confirm to retry it anyway.`);
  }
  await nodeRuns.updateOne({ _id: failed._id }, { $set: { status: "pending", error: null, finishedAt: null, waitState: null } });
  await nodeRuns.updateMany({ runId: run._id, status: "cancelled" }, { $set: { status: "pending", finishedAt: null } });
  const now = new Date();
  await workflowRuns.updateOne(
    { _id: run._id, status: "failed" },
    { $set: { status: "running", error: null, finishedAt: null, nextWakeAt: now, updatedAt: now }, $inc: { version: 1 }, $push: { log: { $each: [{ at: now, nodeId: failed.nodeId, level: "info", message: "Retrying from the failed step." }], $slice: -200 } } },
  );
  await advanceRun(run._id, 15_000);
  return getRunDetail(user, runId, false);
}

// The scheduler's sweep: start due scheduled runs, then advance runs whose wake time has
// passed. Every claim is atomic, so overlapping sweeps on many instances are harmless.
export async function runDueWork(limit = 20): Promise<{ scheduled: number; advanced: number }> {
  const { workflows, workflowRuns } = await collections();
  let scheduled = 0;
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const due = await workflows.findOne({ enabled: true, status: "active", "schedule.nextAt": { $lte: now } });
    if (!due?.schedule) break;
    const slot = due.schedule.nextAt;
    const config = due.graph.nodes.find((n) => n.type === "trigger.schedule")?.config ?? {};
    // A missed slot (every instance was down) fires once, then the schedule moves on from now.
    const following = nextRunAt(config, new Date(Math.max(slot.getTime(), now.getTime())));
    const claimed = await workflows.findOneAndUpdate(
      { _id: due._id, "schedule.nextAt": slot },
      { $set: following ? { "schedule.nextAt": following } : { schedule: null } },
      { returnDocument: "after" },
    );
    if (!claimed) continue;
    const trigger = claimed.graph.nodes.find((n) => n.type === "trigger.schedule");
    let payload: unknown = {};
    try {
      payload = JSON.parse(String(trigger?.config.payload ?? "{}"));
    } catch {
      payload = {};
    }
    const { run } = await createRun(claimed, { type: "trigger.schedule", key: `schedule:${slot.toISOString()}`, payload: { payload, scheduledFor: slot.toISOString() } }).catch(() => ({ run: null }));
    if (run) {
      scheduled++;
      await advanceRun(run._id, 10_000);
    }
  }

  const wake = await workflowRuns.find({ nextWakeAt: { $lte: new Date() }, status: { $in: ["queued", "running", "waiting"] } }, { projection: { _id: 1 } }).limit(limit).toArray();
  for (const r of wake) await advanceRun(r._id, 10_000);
  return { scheduled, advanced: wake.length };
}
