import "server-only";
import type { ObjectId } from "mongodb";
import { collections } from "../db/collections";

// Marks a waiting workflow run as due, so the next advance (inline or from the scheduler)
// re-checks it. Kept free of engine imports so the transfer modules can call it.
export async function wakeRun(runId: ObjectId): Promise<void> {
  const { workflowRuns } = await collections();
  await workflowRuns.updateOne({ _id: runId, status: { $in: ["waiting", "running"] } }, { $set: { nextWakeAt: new Date() } });
}
