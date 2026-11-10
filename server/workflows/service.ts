import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { nodeDefinition } from "@/lib/nodes/registry";
import { cloneForImport, TemplateImportError } from "@/lib/templates/import";
import type { TemplateChecklistItem } from "@/lib/templates/types";
import { nextRunAt, scheduleKey } from "@/lib/workflow/schedule";
import { accessFor, withoutCredentials, type WorkflowAccessDTO } from "@/lib/workflow/sharing";
import { emptyGraph, type WorkflowGraph } from "@/lib/workflow/types";
import { validateGraph } from "@/lib/workflow/validate";
import type { SessionUser } from "../auth/session";
import { collections, isDuplicateKeyError } from "../db/collections";
import { parseId } from "../db/ids";
import { inTransaction } from "../db/transaction";
import type { WorkflowDoc } from "../db/types";
import { errors } from "../errors";
import { getTemplateDoc } from "../templates/service";
import { authorizeWorkflow } from "./access";
import { activateTrigger, deactivateTrigger, triggerFingerprint } from "./activation";

export interface WorkflowDTO {
  id: string;
  name: string;
  status: "active" | "archived";
  enabled: boolean;
  version: number;
  graph: WorkflowGraph;
  triggerType: string | null;
  webhookPath: string;
  // The public hosted PayPal checkout page for workflows started by trigger.paypal_checkout.
  checkoutPath: string;
  nextScheduledAt: string | null;
  runCount: number;
  lastRunAt: string | null;
  updatedAt: string;
  description: string;
  sourceTemplate: { slug: string; revision: number; setupChecklist: TemplateChecklistItem[] } | null;
  // What the person reading this may do with it.
  access: WorkflowAccessDTO;
}

const OWNER_ACCESS = accessFor("owner");

// A viewer gets the shape of the workflow and nothing that acts for its owner: the webhook
// key (which starts runs) is withheld, connection slots are emptied and run stats are hidden.
export function toWorkflowDTO(d: WorkflowDoc, access: WorkflowAccessDTO = OWNER_ACCESS): WorkflowDTO {
  const owner = access.role === "owner";
  return {
    id: d._id.toHexString(),
    name: d.name,
    status: d.status,
    enabled: d.enabled,
    version: d.currentVersion,
    graph: owner ? d.graph : withoutCredentials(d.graph),
    triggerType: d.triggerType,
    webhookPath: owner ? `/api/hooks/${d.webhookKey}` : "",
    checkoutPath: owner ? `/pay/${d.webhookKey}` : "",
    nextScheduledAt: owner ? (d.schedule?.nextAt.toISOString() ?? null) : null,
    runCount: owner ? d.runCount : 0,
    lastRunAt: owner ? (d.lastRunAt?.toISOString() ?? null) : null,
    updatedAt: d.updatedAt.toISOString(),
    description: d.description ?? "",
    sourceTemplate: d.sourceTemplate ? { slug: d.sourceTemplate.slug, revision: d.sourceTemplate.revision, setupChecklist: d.sourceTemplate.setupChecklist } : null,
    access,
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
  const key = scheduleKey(trigger.config);
  if (previous && previous.key === key) return previous;
  const nextAt = nextRunAt(trigger.config, new Date());
  return nextAt ? { key, nextAt } : null;
}

export async function listWorkflows(user: SessionUser, status: "active" | "archived"): Promise<WorkflowDTO[]> {
  const { workflows } = await collections();
  const docs = await workflows.find({ ownerId: user.userId, status }).sort({ updatedAt: -1 }).limit(200).toArray();
  return docs.map((d) => toWorkflowDTO(d));
}

// The workflow as its owner, for anything that changes or runs it.
export async function getWorkflowDoc(user: SessionUser, id: string): Promise<WorkflowDoc> {
  return (await authorizeWorkflow(user, id, "edit")).doc;
}

// The workflow as whoever is asking: the owner's full copy, or a viewer's read-only one.
export async function getWorkflow(user: SessionUser, id: string): Promise<WorkflowDTO> {
  const { doc, role } = await authorizeWorkflow(user, id, "view");
  if (role === "owner") return toWorkflowDTO(doc);
  const { users } = await collections();
  const owner = await users.findOne({ _id: doc.ownerId }, { projection: { name: 1 } });
  return toWorkflowDTO(doc, accessFor("viewer", owner?.name ?? null));
}

interface NewWorkflow {
  name: string;
  graph: WorkflowGraph;
  description?: string;
  sourceTemplate?: WorkflowDoc["sourceTemplate"];
  requestKey?: string;
}

// Every new workflow starts off (enabled: false): triggers stay silent until the owner has
// finished setup and switches it on.
async function insertWorkflow(user: SessionUser, input: NewWorkflow): Promise<WorkflowDoc> {
  const { workflows, workflowVersions } = await collections();
  const now = new Date();
  const doc: WorkflowDoc = {
    _id: new ObjectId(),
    ownerId: user.userId,
    name: input.name,
    status: "active",
    enabled: false,
    currentVersion: 1,
    graph: input.graph,
    triggerType: triggerOf(input.graph)?.type ?? null,
    webhookKey: randomBytes(18).toString("base64url"),
    schedule: null,
    runCount: 0,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
    ...(input.description ? { description: input.description } : {}),
    ...(input.sourceTemplate ? { sourceTemplate: input.sourceTemplate } : {}),
    ...(input.requestKey ? { createRequestKey: input.requestKey } : {}),
  };
  try {
    await inTransaction(async (session) => {
      await workflows.insertOne(doc, { session });
      await workflowVersions.insertOne({ _id: new ObjectId(), workflowId: doc._id, ownerId: user.userId, version: 1, graph: input.graph, createdAt: now }, { session });
    });
  } catch (error) {
    // The same request key twice (a double click, a retried request) returns the first workflow.
    if (!input.requestKey || !isDuplicateKeyError(error)) throw error;
    const existing = await workflows.findOne({ ownerId: user.userId, createRequestKey: input.requestKey });
    if (!existing) throw error;
    return existing;
  }
  return doc;
}

export type CreateInput = { templateId: "blank"; name?: string; requestKey?: string } | { templateSlug: string; name?: string; requestKey?: string };

export async function createWorkflow(user: SessionUser, input: CreateInput): Promise<WorkflowDTO> {
  if ("templateId" in input) {
    return toWorkflowDTO(await insertWorkflow(user, { name: input.name?.trim() || "Untitled workflow", graph: emptyGraph(), requestKey: input.requestKey }));
  }
  const template = await getTemplateDoc(input.templateSlug);
  let graph: WorkflowGraph;
  try {
    graph = cloneForImport(template.graphDefinition, template.graphSchemaVersion);
  } catch (error) {
    if (error instanceof TemplateImportError) throw errors.invalidState(error.message);
    throw error;
  }
  const doc = await insertWorkflow(user, {
    name: input.name?.trim() || template.name,
    graph,
    description: template.shortDescription,
    sourceTemplate: { id: template._id, slug: template.slug, revision: template.revision, setupChecklist: structuredClone(template.setupChecklist) },
    requestKey: input.requestKey,
  });
  return toWorkflowDTO(doc);
}

// Drafts from the agent are validated by the caller and land off, like every new workflow.
export async function createDraftWorkflow(
  user: SessionUser,
  input: { name: string; description: string; graph: WorkflowGraph; requestKey?: string },
): Promise<WorkflowDTO> {
  return toWorkflowDTO(await insertWorkflow(user, input));
}

export async function saveWorkflow(
  user: SessionUser,
  id: string,
  input: { name: string; graph: WorkflowGraph; expectedVersion: number },
): Promise<{ workflow: WorkflowDTO; disabledBecauseInvalid: boolean; disabledReason: string | null }> {
  const { workflows, workflowVersions } = await collections();
  const workflowId = parseId(id, "Workflow");
  const current = await getWorkflowDoc(user, id);
  const invalid = validateGraph(input.graph).length > 0;
  // Editing a live trigger (say, the repository) turns the workflow off instead of
  // re-registering webhooks on every autosave; turning it on again applies the change.
  const triggerChanged = triggerFingerprint(current.graph) !== triggerFingerprint(input.graph);
  const enabled = current.enabled && !invalid && !triggerChanged;
  const disabledReason = current.enabled && !enabled ? (invalid ? "Turned off because the workflow has issues. Fix them and turn it on again." : "Turned off because the trigger changed. Turn it on again to apply the change.") : null;
  if (current.enabled && !enabled) await deactivateTrigger(current);
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
          ...(enabled ? {} : { inboundRoute: null, remoteHook: null }),
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
  return { workflow: toWorkflowDTO(saved), disabledBecauseInvalid: current.enabled && !enabled, disabledReason };
}

export async function setWorkflowEnabled(user: SessionUser, id: string, enabled: boolean): Promise<WorkflowDTO> {
  const doc = await getWorkflowDoc(user, id);
  if (enabled) {
    const issues = validateGraph(doc.graph);
    if (issues.length) throw errors.validation(`Fix ${issues.length} issue${issues.length > 1 ? "s" : ""} before turning this workflow on: ${issues[0].message}`);
    if (doc.status === "archived") throw errors.invalidState("Restore this workflow before turning it on.");
  }
  if (enabled === doc.enabled) return toWorkflowDTO(doc);
  // Register first, record second: if the record fails, the fresh registration is undone.
  const activation = enabled ? await activateTrigger(doc) : { inboundRoute: null, remoteHook: null };
  if (!enabled) await deactivateTrigger(doc);
  const { workflows } = await collections();
  const next = await workflows.findOneAndUpdate(
    { _id: doc._id, ownerId: user.userId, currentVersion: doc.currentVersion },
    { $set: { enabled, schedule: scheduleFor(doc.graph, enabled, doc.schedule), ...activation, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!next) {
    if (enabled) await deactivateTrigger({ ...doc, ...activation });
    throw errors.staleWrite();
  }
  return toWorkflowDTO(next);
}

// The copy always belongs to whoever made it. A viewer's copy starts with empty connection
// slots, since the original's connections are its owner's.
export async function duplicateWorkflow(user: SessionUser, id: string): Promise<WorkflowDTO> {
  const { doc: source, role } = await authorizeWorkflow(user, id, "copy");
  const graph = role === "owner" ? source.graph : withoutCredentials(source.graph);
  return toWorkflowDTO(await insertWorkflow(user, { name: `${source.name} (copy)`.slice(0, 80), graph, description: source.description, sourceTemplate: source.sourceTemplate ?? null }));
}

export async function setWorkflowStatus(user: SessionUser, id: string, status: "active" | "archived"): Promise<WorkflowDTO> {
  const { workflows } = await collections();
  if (status === "archived") {
    const current = await getWorkflowDoc(user, id);
    if (current.enabled) await deactivateTrigger(current);
  }
  const next = await workflows.findOneAndUpdate(
    { _id: parseId(id, "Workflow"), ownerId: user.userId },
    { $set: { status, ...(status === "archived" ? { enabled: false, schedule: null, inboundRoute: null, remoteHook: null } : {}), updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!next) throw errors.notFound("Workflow");
  return toWorkflowDTO(next);
}

// Permanent delete is a second step after archiving, so one click never destroys a workflow.
// It refuses while a run is still live, so no payout loses the workflow it belongs to.
// Transfers (executions) are kept: they are the money record and stay on the Transfers page.
export async function deleteWorkflow(user: SessionUser, id: string): Promise<void> {
  const workflowId = parseId(id, "Workflow");
  const { workflows, workflowVersions, workflowShares, workflowRuns, nodeRuns } = await collections();
  const doc = await workflows.findOne({ _id: workflowId, ownerId: user.userId }, { projection: { status: 1 } });
  if (!doc) throw errors.notFound("Workflow");
  if (doc.status !== "archived") throw errors.invalidState("Archive the workflow before deleting it.");
  const live = await workflowRuns.countDocuments({ workflowId, status: { $in: ["queued", "running", "waiting"] } }, { limit: 1 });
  if (live) throw errors.invalidState("A run of this workflow is still in progress. Cancel it or let it finish, then delete.");

  await inTransaction(async (session) => {
    const runIds = (await workflowRuns.find({ workflowId }, { projection: { _id: 1 }, session }).toArray()).map((r) => r._id);
    await nodeRuns.deleteMany({ runId: { $in: runIds } }, { session });
    await workflowRuns.deleteMany({ workflowId }, { session });
    await workflowVersions.deleteMany({ workflowId }, { session });
    await workflowShares.deleteMany({ workflowId }, { session });
    await workflows.deleteOne({ _id: workflowId, ownerId: user.userId }, { session });
  });
}
