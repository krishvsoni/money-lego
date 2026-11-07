import "server-only";
import type { ObjectId } from "mongodb";
import { nodeDefinition } from "@/lib/nodes/registry";
import { resolveValue, type Scope } from "@/lib/workflow/expressions";
import type { NodeRunStatus, WorkflowEdge } from "@/lib/workflow/types";
import { topologicalOrder } from "@/lib/workflow/validate";
import { collections } from "../db/collections";
import { INSTANCE_ID } from "../db/locks";
import type { NodeRunDoc, RunLogEntry, WorkflowRunDoc } from "../db/types";
import { isAppError } from "../errors";
import { log } from "../log";
import { indexRun } from "../integrations/elastic";
import { executorFor } from "./executors";
import { NodeError, type ExecResult } from "./types";

const LEASE_MS = 60_000;
const NODE_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 32_000;
const SETTLED: NodeRunStatus[] = ["succeeded", "failed", "skipped", "cancelled"];
// Waits that depend on something outside the run are re-checked on this cadence even if
// no one wakes the run, as a safety net under webhooks and the reconciler.
const EXTERNAL_RECHECK_MS = 2 * 60_000;

function bounded(value: unknown): unknown {
  const text = JSON.stringify(value ?? null);
  return text.length <= MAX_OUTPUT_CHARS ? value : { truncated: true, preview: text.slice(0, 2_000) };
}

function safeMessage(error: unknown): string {
  if (error instanceof NodeError || isAppError(error)) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "The node took too long and was stopped.";
  return "The node hit an unexpected error.";
}

async function claim(runId: ObjectId): Promise<WorkflowRunDoc | null> {
  const { workflowRuns } = await collections();
  const now = new Date();
  return workflowRuns.findOneAndUpdate(
    { _id: runId, status: { $in: ["queued", "running", "waiting"] }, $or: [{ lease: null }, { "lease.expiresAt": { $lte: now } }, { "lease.owner": INSTANCE_ID }] },
    { $set: { lease: { owner: INSTANCE_ID, expiresAt: new Date(now.getTime() + LEASE_MS) }, nextWakeAt: null } },
    { returnDocument: "after" },
  );
}

// Advances a run as far as it can go right now. Safe to call from anywhere, any number of
// times, on any instance: the lease means only one caller works on a run at once, and every
// node transition is persisted before the next node starts.
export async function advanceRun(runId: ObjectId, budgetMs = 20_000): Promise<void> {
  const run = await claim(runId);
  if (!run) return;
  const { workflowRuns, nodeRuns, users } = await collections();
  const deadline = Date.now() + budgetMs;
  const pendingLog: RunLogEntry[] = [];
  const addLog = (nodeId: string | null, message: string, level: RunLogEntry["level"] = "info") => pendingLog.push({ at: new Date(), nodeId, level, message });

  try {
    const owner = await users.findOne({ _id: run.ownerId });
    const order = topologicalOrder(run.graph);
    if (!order || !owner) {
      await finish(run, "failed", order ? "The workflow owner no longer exists." : "The workflow has a loop.", pendingLog);
      return;
    }

    let status: WorkflowRunDoc["status"] = "running";
    let error: string | null = null;
    let waiting: WorkflowRunDoc["waiting"] = null;
    let wakeAt: Date | null = null;

    for (const nodeId of order) {
      if (Date.now() > deadline) {
        wakeAt = new Date();
        break;
      }
      const fresh = await workflowRuns.findOne({ _id: run._id }, { projection: { status: 1 } });
      if (fresh?.status === "cancelled") return;

      const node = run.graph.nodes.find((n) => n.id === nodeId)!;
      const runs = await nodeRuns.find({ runId: run._id }).toArray();
      const state = new Map(runs.map((r) => [r.nodeId, r]));
      const current = state.get(nodeId);
      if (current && SETTLED.includes(current.status)) continue;

      const incoming: WorkflowEdge[] = run.graph.edges.filter((e) => e.target === nodeId);
      const def = nodeDefinition(node.type);
      const isTrigger = def?.category === "triggers";
      if (!isTrigger && incoming.some((e) => !SETTLED.includes(state.get(e.source)?.status ?? "pending"))) continue;

      const fired = incoming.filter((e) => state.get(e.source)?.status === "succeeded" && state.get(e.source)?.port === e.sourcePort);
      if (!isTrigger && (fired.length === 0 || node.disabled)) {
        await upsertNode(run, node.id, node.type, { status: "skipped", finishedAt: new Date() });
        continue;
      }

      if (current?.status === "running" && def && !def.retrySafe) {
        const message = "This step was interrupted mid-request, so it may or may not have happened. Check before retrying.";
        await upsertNode(run, node.id, node.type, { status: "failed", error: message, finishedAt: new Date() });
        status = "failed";
        error = `${def.title}: ${message}`;
        break;
      }

      const input = fired.length === 1 ? state.get(fired[0].source)?.output : Object.assign({}, ...fired.map((e) => state.get(e.source)?.output));
      const outputs = Object.fromEntries(runs.filter((r) => r.status === "succeeded").map((r) => [r.nodeId, r.output]));
      const scope: Scope = { input, trigger: run.trigger.payload, nodes: outputs, run: { id: run._id.toHexString(), workflowId: run.workflowId.toHexString() } };

      const result = await runNode(run, node, def?.title ?? node.type, input, scope, current ?? null, addLog);
      if (result.kind === "failed") {
        status = "failed";
        error = `${def?.title ?? node.type}: ${result.message}`;
        break;
      }
      if (result.kind === "wait") {
        status = "waiting";
        waiting = { nodeId: node.id, kind: result.wait.kind, until: result.wait.until, ref: result.wait.ref };
        const external = result.wait.kind === "provider";
        const recheck = external ? new Date(Date.now() + EXTERNAL_RECHECK_MS) : result.wait.until;
        wakeAt = [recheck, result.wait.until].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
      }
    }

    if (status === "running" && !wakeAt) {
      const all = await nodeRuns.find({ runId: run._id }).toArray();
      const settled = run.graph.nodes.every((n) => SETTLED.includes(all.find((r) => r.nodeId === n.id)?.status ?? "pending"));
      if (settled) {
        // A failure branch that ran (e.g. to notify someone) doesn't make the run a success.
        const handled = all.find((r) => r.status === "succeeded" && r.port === "failed");
        if (handled) await finish(run, "failed", `${nodeDefinition(handled.nodeType)?.title ?? handled.nodeType}: the PayPal action didn't fully succeed. The problem branch ran.`, pendingLog);
        else await finish(run, "succeeded", null, pendingLog);
        return;
      }
    }
    if (status === "failed") {
      await finish(run, "failed", error, pendingLog);
      return;
    }
    await workflowRuns.updateOne(
      { _id: run._id, status: { $ne: "cancelled" } },
      {
        $set: { status, waiting, nextWakeAt: wakeAt, lease: null, updatedAt: new Date() },
        $inc: { version: 1 },
        $push: { log: { $each: pendingLog, $slice: -200 } },
      },
    );
  } catch (err) {
    log.error("engine.advance_failed", { runId: runId.toHexString(), err });
    await workflowRuns.updateOne({ _id: runId }, { $set: { lease: null, nextWakeAt: new Date(Date.now() + 30_000) }, $push: { log: { $each: pendingLog, $slice: -200 } } });
  }
}

async function upsertNode(run: WorkflowRunDoc, nodeId: string, nodeType: string, set: Partial<NodeRunDoc>, inc?: Partial<Record<"attempts", number>>) {
  const { nodeRuns } = await collections();
  await nodeRuns.updateOne(
    { runId: run._id, nodeId },
    {
      $set: set,
      ...(inc ? { $inc: inc } : {}),
      $setOnInsert: {
        ownerId: run.ownerId,
        nodeType,
        ...(inc ? {} : { attempts: 0 }),
        ...("port" in set ? {} : { port: null }),
        ...("input" in set ? {} : { input: null }),
        ...("output" in set ? {} : { output: null }),
        ...("error" in set ? {} : { error: null }),
        ...("waitState" in set ? {} : { waitState: null }),
        ...("startedAt" in set ? {} : { startedAt: null }),
        ...("finishedAt" in set ? {} : { finishedAt: null }),
      },
    },
    { upsert: true },
  );
}

type NodeOutcome = { kind: "done" } | { kind: "failed"; message: string } | Extract<ExecResult, { kind: "wait" }>;

async function runNode(
  run: WorkflowRunDoc,
  node: WorkflowRunDoc["graph"]["nodes"][number],
  title: string,
  input: unknown,
  scope: Scope,
  previous: NodeRunDoc | null,
  addLog: (nodeId: string | null, message: string, level?: RunLogEntry["level"]) => void,
): Promise<NodeOutcome> {
  const executor = executorFor(node.type);
  const resuming = previous?.status === "waiting";
  if (!resuming) {
    await upsertNode(run, node.id, node.type, { status: "running", input: bounded(input), startedAt: new Date(), error: null }, { attempts: 1 });
  }
  if (!executor || nodeDefinition(node.type)?.unavailable) {
    const message = "This node type isn't available, so the run can't continue.";
    await upsertNode(run, node.id, node.type, { status: "failed", error: message, finishedAt: new Date() });
    return { kind: "failed", message };
  }

  const started = Date.now();
  try {
    const config = resolveValue(node.config, scope) as Record<string, unknown>;
    const result = await executor({
      run,
      node,
      config,
      input,
      scope,
      ownerId: run.ownerId,
      waitState: previous?.waitState ?? null,
      signal: AbortSignal.timeout(NODE_TIMEOUT_MS),
      log: (message, level) => addLog(node.id, message, level),
    });
    if (result.kind === "wait") {
      await upsertNode(run, node.id, node.type, { status: "waiting", waitState: { ...(previous?.waitState ?? {}), ...result.state } });
      if (!resuming) addLog(node.id, `${title} is waiting (${result.wait.kind}).`);
      return result;
    }
    await upsertNode(run, node.id, node.type, { status: "succeeded", output: bounded(result.output), port: result.port ?? null, finishedAt: new Date() });
    addLog(node.id, `${title} finished in ${Date.now() - started} ms.`);
    return { kind: "done" };
  } catch (err) {
    const message = safeMessage(err);
    if (!(err instanceof NodeError) && !isAppError(err)) log.error("engine.node_crashed", { runId: run._id.toHexString(), nodeId: node.id, err });
    await upsertNode(run, node.id, node.type, { status: "failed", error: message, finishedAt: new Date() });
    addLog(node.id, `${title} failed: ${message}`, "error");
    return { kind: "failed", message };
  }
}

async function finish(run: WorkflowRunDoc, status: "succeeded" | "failed", error: string | null, pendingLog: RunLogEntry[]) {
  const { workflowRuns, nodeRuns } = await collections();
  if (status === "failed") {
    await nodeRuns.updateMany({ runId: run._id, status: { $in: ["pending", "waiting"] } }, { $set: { status: "cancelled", finishedAt: new Date() } });
  }
  pendingLog.push({ at: new Date(), nodeId: null, level: status === "failed" ? "error" : "info", message: status === "failed" ? `Run failed. ${error}` : "Run finished." });
  await workflowRuns.updateOne(
    { _id: run._id, status: { $ne: "cancelled" } },
    {
      $set: { status, error, waiting: null, nextWakeAt: null, lease: null, finishedAt: new Date(), updatedAt: new Date() },
      $inc: { version: 1 },
      $push: { log: { $each: pendingLog, $slice: -200 } },
    },
  );
  // Make the finished run searchable (Elastic, when configured). Never blocks or fails the run.
  void indexRun(run._id);
}
