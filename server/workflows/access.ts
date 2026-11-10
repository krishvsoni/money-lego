import "server-only";
import { can, type WorkflowAction, type WorkflowRole } from "@/lib/workflow/sharing";
import type { SessionUser } from "../auth/session";
import { collections } from "../db/collections";
import { parseId } from "../db/ids";
import type { WorkflowDoc } from "../db/types";
import { errors } from "../errors";

// The one place that decides who a person is to a workflow. Every request that names a
// workflow id comes through authorizeWorkflow, so a new action is a new row in the grants
// table (lib/workflow/sharing.ts) rather than another hand-written ownership filter.

const DENIED: Partial<Record<WorkflowAction, string>> = {
  edit: "You can view this workflow, but only its owner can change or run it. Make a copy to work on your own.",
  run: "Only the owner can run this workflow or turn it on, because runs use the owner's connections and PayPal.",
  share: "Only the owner can share this workflow.",
};

// Viewers see a workflow while it is active; archiving one takes it off their shelf too.
export async function roleOn(doc: WorkflowDoc, user: SessionUser): Promise<WorkflowRole | null> {
  if (doc.ownerId.equals(user.userId)) return "owner";
  if (doc.status !== "active" || !user.email) return null;
  const { workflowShares } = await collections();
  const share = await workflowShares.findOne({ workflowId: doc._id, email: user.email }, { projection: { role: 1 } });
  return share ? (share.role === "editor" ? "editor" : "viewer") : null;
}

// No access at all reads exactly like a workflow that doesn't exist, so ids reveal nothing.
// Someone who can see it but may not do this gets a 403 that says why.
export async function authorizeWorkflow(user: SessionUser, id: string, action: WorkflowAction): Promise<{ doc: WorkflowDoc; role: WorkflowRole }> {
  const { workflows } = await collections();
  const doc = await workflows.findOne({ _id: parseId(id, "Workflow") });
  const role = doc ? await roleOn(doc, user) : null;
  if (!doc || !role) throw errors.notFound("Workflow");
  if (!can(role, action)) throw errors.forbidden(DENIED[action]);
  return { doc, role };
}
