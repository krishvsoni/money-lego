import "server-only";
import { ObjectId } from "mongodb";
import { collections, isDuplicateKeyError } from "../../db/collections";
import { asObject, NodeError, ok, type Executor } from "../types";

// Claims a business key (order, capture, invoice id) for one run of this workflow. A key held
// by a run that failed or was cancelled before any PayPal money action is released to the
// next run; otherwise the second run stops.
const once: Executor = async ({ config, input, run }) => {
  const key = String(config.key ?? "").trim();
  if (!key || key.length > 200 || /\{\{|\bundefined\b|\bnull\b|:$|::/.test(key)) throw new NodeError("The key didn't resolve to a value. Check the expression points at an ID.");
  const { onceKeys, workflowRuns, paypalResources } = await collections();
  const claim = { workflowId: run.workflowId, key, runId: run._id, claimedAt: new Date() };
  try {
    await onceKeys.insertOne({ _id: new ObjectId(), ...claim });
    return ok({ ...asObject(input), onceKey: key });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const existing = await onceKeys.findOne({ workflowId: run.workflowId, key });
  if (!existing) throw new NodeError("Couldn't claim this key. Retry the run.");
  if (existing.runId.equals(run._id)) return ok({ ...asObject(input), onceKey: key });

  const previous = await workflowRuns.findOne({ _id: existing.runId }, { projection: { status: 1 } });
  const ended = !previous || previous.status === "failed" || previous.status === "cancelled";
  const acted = await paypalResources.countDocuments({ runId: existing.runId, "detail.sideEffect": true }, { limit: 1 });
  if (ended && !acted) {
    // Compare-and-set on the old holder, so two retries racing for the key can't both win.
    const taken = await onceKeys.findOneAndUpdate({ _id: existing._id, runId: existing.runId }, { $set: { runId: run._id, claimedAt: new Date() } });
    if (taken) return ok({ ...asObject(input), onceKey: key });
  }
  throw new NodeError(`"${key}" was already handled by run ${existing.runId.toHexString()}, so this run stopped. Nothing was sent.`);
};

export const onceExecutors: Record<string, Executor> = { "logic.once": once };
