import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { nodeDefinition } from "@/lib/nodes/registry";
import { findTemplate } from "@/lib/workflow/templates";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { validateGraph } from "@/lib/workflow/validate";
import type { SessionUser } from "../auth/session";
import { collections } from "../db/collections";
import { parseId } from "../db/ids";
import { inTransaction } from "../db/transaction";
import type { WorkflowDoc } from "../db/types";
import { errors } from "../errors";

export interface WorkflowDTO {
  id: string;
  name: string;
  status: "active" | "archived";
  enabled: boolean;
  version: number;
  graph: WorkflowGraph;
  triggerType: string | null;
  webhookPath: string;
  nextScheduledAt: string | null;
  runCount: number;
  lastRunAt: string | null;
  updatedAt: string;
}

export function toWorkflowDTO(d: WorkflowDoc): WorkflowDTO {
  return {
    id: d._id.toHexString(),
    name: d.name,
    status: d.status,
    enabled: d.enabled,
    version: d.currentVersion,
    graph: d.graph,
    triggerType: d.triggerType,
    webhookPath: `/api/hooks/${d.webhookKey}`,
    nextScheduledAt: d.schedule?.nextAt.toISOString() ?? null,
    runCount: d.runCount,
    lastRunAt: d.lastRunAt?.toISOString() ?? null,
    updatedAt: d.updatedAt.toISOString(),
  };
}

function triggerOf(graph: WorkflowGraph) {
  return graph.nodes.find((n) => nodeDefinition(n.type)?.category === "triggers") ?? null;
}

// The schedule lives on the workflow so the scheduler can find due work with one indexed
// query. It only exists while the workflow is enabled with a schedule trigger.
function scheduleFor(graph: WorkflowGraph, enabled: boolean, previous: WorkflowDoc["schedule"]): WorkflowDoc["schedule"] {
  const trigger = triggerOf(graph);
  if (!enabled || trigger?.type !== "trigger.schedule") return null;
  const intervalMinutes = Math.max(5, Number(trigger.config.intervalMinutes) || 60);
  if (previous && previous.intervalMinutes === intervalMinutes) return previous;
  return { intervalMinutes, nextAt: new Date(Date.now() + intervalMinutes * 60_000) };
}

export async function listWorkflows(user: SessionUser, status: "active" | "archived"): Promise<WorkflowDTO[]> {
  const { workflows } = await collections();
  const docs = await workflows.find({ ownerId: user.userId, status }).sort({ updatedAt: -1 }).limit(200).toArray();
  return docs.map(toWorkflowDTO);
}

export async function getWorkflowDoc(user: SessionUser, id: string): Promise<WorkflowDoc> {
  const { workflows } = await collections();
  const doc = await workflows.findOne({ _id: parseId(id, "Workflow"), ownerId: user.userId });
  if (!doc) throw errors.notFound("Workflow");
  return doc;
}

async function insertWorkflow(user: SessionUser, name: string, graph: WorkflowGraph): Promise<WorkflowDoc> {
  const { workflows, workflowVersions } = await collections();
  const now = new Date();
  const doc: WorkflowDoc = {
    _id: new ObjectId(),
    ownerId: user.userId,
    name,
    status: "active",
    enabled: false,
    currentVersion: 1,
    graph,
    triggerType: triggerOf(graph)?.type ?? null,
    webhookKey: randomBytes(18).toString("base64url"),
    schedule: null,
    runCount: 0,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await inTransaction(async (session) => {
    await workflows.insertOne(doc, { session });
    await workflowVersions.insertOne({ _id: new ObjectId(), workflowId: doc._id, ownerId: user.userId, version: 1, graph, createdAt: now }, { session });
  });
  return doc;
}

export async function createWorkflow(user: SessionUser, templateId: string, name?: string): Promise<WorkflowDTO> {
  const template = findTemplate(templateId);
  if (!template) throw errors.validation("Unknown template.");
  return toWorkflowDTO(await insertWorkflow(user, name?.trim() || template.name, template.graph()));
}

export async function saveWorkflow(
  user: SessionUser,
  id: string,
  input: { name: string; graph: WorkflowGraph; expectedVersion: number },
): Promise<{ workflow: WorkflowDTO; disabledBecauseInvalid: boolean }> {
  const { workflows, workflowVersions } = await collections();
  const workflowId = parseId(id, "Workflow");
  const current = await getWorkflowDoc(user, id);
  const invalid = validateGraph(input.graph).length > 0;
  const enabled = current.enabled && !invalid;
  const now = new Date();

  const saved = await inTransaction(async (session) => {
    const next = await workflows.findOneAndUpdate(
      { _id: workflowId, ownerId: user.userId, status: "active", currentVersion: input.expectedVersion },
      {
        $set: {
          name: input.name,
          graph: input.graph,
          enabled,
          triggerType: triggerOf(input.graph)?.type ?? null,
          schedule: scheduleFor(input.graph, enabled, current.schedule),
          updatedAt: now,
        },
        $inc: { currentVersion: 1 },
      },
      { returnDocument: "after", session },
    );
    if (!next) return null;
    await workflowVersions.insertOne(
      { _id: new ObjectId(), workflowId, ownerId: user.userId, version: next.currentVersion, graph: input.graph, createdAt: now },
      { session },
    );
    return next;
  });

  if (!saved) {
    if (current.status === "archived") throw errors.invalidState("Restore this workflow before editing it.");
    throw errors.staleWrite();
  }
  return { workflow: toWorkflowDTO(saved), disabledBecauseInvalid: current.enabled && !enabled };
}

export async function setWorkflowEnabled(user: SessionUser, id: string, enabled: boolean): Promise<WorkflowDTO> {
  const doc = await getWorkflowDoc(user, id);
  if (enabled) {
    const issues = validateGraph(doc.graph);
    if (issues.length) throw errors.validation(`Fix ${issues.length} issue${issues.length > 1 ? "s" : ""} before turning this workflow on: ${issues[0].message}`);
    if (doc.status === "archived") throw errors.invalidState("Restore this workflow before turning it on.");
  }
  const { workflows } = await collections();
  const next = await workflows.findOneAndUpdate(
    { _id: doc._id, ownerId: user.userId, currentVersion: doc.currentVersion },
    { $set: { enabled, schedule: scheduleFor(doc.graph, enabled, doc.schedule), updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!next) throw errors.staleWrite();
  return toWorkflowDTO(next);
}

export async function duplicateWorkflow(user: SessionUser, id: string): Promise<WorkflowDTO> {
  const source = await getWorkflowDoc(user, id);
  return toWorkflowDTO(await insertWorkflow(user, `${source.name} (copy)`.slice(0, 80), source.graph));
}

export async function setWorkflowStatus(user: SessionUser, id: string, status: "active" | "archived"): Promise<WorkflowDTO> {
  const { workflows } = await collections();
  const next = await workflows.findOneAndUpdate(
    { _id: parseId(id, "Workflow"), ownerId: user.userId },
    { $set: { status, ...(status === "archived" ? { enabled: false, schedule: null } : {}), updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!next) throw errors.notFound("Workflow");
  return toWorkflowDTO(next);
}
