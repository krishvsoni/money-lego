import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { accessFor, MAX_SHARES, withoutCredentials, type ShareDTO, type SharingDTO, type WorkflowRole } from "@/lib/workflow/sharing";
import type { SessionUser } from "../auth/session";
import { collections, EMAIL_COLLATION, isDuplicateKeyError } from "../db/collections";
import { parseId } from "../db/ids";
import { inTransaction } from "../db/transaction";
import type { UserDoc, WorkflowDoc, WorkflowShareDoc } from "../db/types";
import { errors } from "../errors";
import { authorizeWorkflow } from "./access";
import { deactivateTrigger } from "./activation";
import { toWorkflowDTO, type WorkflowDTO } from "./service";

// Sharing a workflow by email. Two things can be given:
//   view access   a share row per address; the person sees a read-only copy and can duplicate it.
//   ownership     a transfer: the workflow moves to the other account, switched off and with
//                 its connection slots emptied, and the former owner keeps view access.
// Runs, approvals and PayPal records stay with the account that made them in both cases.
//
// Every command returns the sharing state after it, so the dialog renders from one source.

const emailIssue = (message: string) => errors.validation(message, [{ path: "email", message }]);

// Only members whose address Clerk verified count: a share is claimed by signing in with it.
const verifiedMember = (emails: string[]) => ({ email: { $in: emails }, emailVerified: { $ne: false } });

async function sharingOf(doc: WorkflowDoc): Promise<SharingDTO> {
  const { users, workflowShares } = await collections();
  const [owner, shares] = await Promise.all([
    users.findOne({ _id: doc.ownerId }, { projection: { name: 1, email: 1 } }),
    workflowShares.find({ workflowId: doc._id }).sort({ createdAt: 1 }).toArray(),
  ]);
  const joined = shares.length
    ? await users.find(verifiedMember(shares.map((s) => s.email)), { collation: EMAIL_COLLATION, projection: { email: 1 } }).toArray()
    : [];
  const members = new Set(joined.map((m) => m.email?.toLowerCase()));
  return {
    owner: { name: owner?.name ?? "Money Lego user", email: owner?.email ?? null },
    shares: shares.map(
      (s): ShareDTO => ({ id: s._id.toHexString(), email: s.email, role: s.role, status: members.has(s.email) ? "active" : "pending", createdAt: s.createdAt.toISOString() }),
    ),
    limit: MAX_SHARES,
  };
}

export async function getSharing(user: SessionUser, id: string): Promise<SharingDTO> {
  return sharingOf((await authorizeWorkflow(user, id, "share")).doc);
}

const viewerShare = (workflowId: ObjectId, email: string, invitedBy: ObjectId, now: Date): WorkflowShareDoc => ({ _id: new ObjectId(), workflowId, email, role: "viewer", invitedBy, createdAt: now });

// Sharing with an address that already has access changes nothing and succeeds, so a double
// click or a retried request can never fail or add a second row.
export async function shareWorkflow(user: SessionUser, id: string, email: string): Promise<{ sharing: SharingDTO; created: boolean }> {
  const { doc } = await authorizeWorkflow(user, id, "share");
  if (email === user.email) throw emailIssue("That's you. You already own this workflow.");
  if (doc.status !== "active") throw errors.invalidState("Restore this workflow before sharing it.");

  const { workflowShares } = await collections();
  const filter = { workflowId: doc._id, email };
  let created = false;
  if (!(await workflowShares.findOne(filter, { projection: { _id: 1 } }))) {
    if ((await workflowShares.countDocuments({ workflowId: doc._id })) >= MAX_SHARES) {
      throw errors.invalidState(`A workflow can be shared with up to ${MAX_SHARES} people. Remove someone to add another.`);
    }
    try {
      await workflowShares.insertOne(viewerShare(doc._id, email, user.userId, new Date()));
      created = true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  return { sharing: await sharingOf(doc), created };
}

// The owner removes anyone; "me" is how a viewer leaves. Removing access that is already
// gone succeeds, for the same reason sharing twice does.
export async function revokeShare(user: SessionUser, id: string, shareId: string): Promise<{ sharing: SharingDTO | null }> {
  const { workflowShares } = await collections();
  if (shareId === "me") {
    const { doc, role } = await authorizeWorkflow(user, id, "view");
    if (role === "owner") throw errors.invalidState("You own this workflow. Transfer it to someone else or archive it instead.");
    await workflowShares.deleteOne({ workflowId: doc._id, email: user.email ?? "" });
    return { sharing: null };
  }
  const { doc } = await authorizeWorkflow(user, id, "share");
  await workflowShares.deleteOne({ _id: parseId(shareId, "Share"), workflowId: doc._id });
  return { sharing: await sharingOf(doc) };
}

async function memberByEmail(email: string): Promise<UserDoc | null> {
  const { users } = await collections();
  // Newest first: the same address under an older sign-in is a stale record.
  return users.find(verifiedMember([email]), { collation: EMAIL_COLLATION }).sort({ createdAt: -1 }).limit(1).next();
}

// Hands the workflow to another account. The new owner starts from a clean, switched-off
// workflow: live triggers are removed first (they were registered with the former owner's
// connections), connection slots are emptied, and the webhook/checkout key is replaced so
// the former owner's links can no longer start runs. Runs already made, and any still in
// flight, stay with the former owner, who keeps view access.
export async function transferWorkflow(user: SessionUser, id: string, email: string): Promise<{ transferred: true; role: WorkflowRole | null }> {
  const { doc } = await authorizeWorkflow(user, id, "share");
  if (email === user.email) throw emailIssue("That's you. You already own this workflow.");
  const recipient = await memberByEmail(email);
  if (!recipient) throw emailIssue("No Money Lego account uses that email yet. Share it as view-only for now, and make them the owner once they've signed in.");
  if (recipient._id.equals(user.userId)) throw emailIssue("That's you. You already own this workflow.");
  if (doc.status !== "active") throw errors.invalidState("Restore this workflow before transferring it.");

  if (doc.enabled) await deactivateTrigger(doc);
  const { workflows, workflowVersions, workflowShares } = await collections();
  const graph = withoutCredentials(doc.graph);
  const now = new Date();

  const moved = await inTransaction(async (session) => {
    const next = await workflows.findOneAndUpdate(
      { _id: doc._id, ownerId: user.userId, status: "active", currentVersion: doc.currentVersion },
      {
        $set: {
          ownerId: recipient._id,
          graph,
          enabled: false,
          schedule: null,
          inboundRoute: null,
          remoteHook: null,
          webhookKey: randomBytes(18).toString("base64url"),
          runCount: 0,
          lastRunAt: null,
          updatedAt: now,
        },
        $unset: { createRequestKey: "" },
        $inc: { currentVersion: 1 },
      },
      { returnDocument: "after", session },
    );
    if (!next) return null;
    await workflowVersions.insertOne({ _id: new ObjectId(), workflowId: doc._id, ownerId: recipient._id, version: next.currentVersion, graph, createdAt: now }, { session });
    await workflowShares.deleteOne({ workflowId: doc._id, email }, { session });
    if (user.email) {
      const mine = viewerShare(doc._id, user.email, recipient._id, now);
      await workflowShares.updateOne({ workflowId: doc._id, email: user.email }, { $setOnInsert: mine }, { upsert: true, session });
    }
    return next;
  });

  if (!moved) throw errors.staleWrite();
  return { transferred: true, role: user.email ? "viewer" : null };
}

// Everything other people have shared with this address, newest change first.
export async function listSharedWorkflows(user: SessionUser): Promise<WorkflowDTO[]> {
  if (!user.email) return [];
  const { users, workflows, workflowShares } = await collections();
  const ids = (await workflowShares.find({ email: user.email }, { projection: { workflowId: 1 } }).limit(200).toArray()).map((s) => s.workflowId);
  if (!ids.length) return [];
  const docs = await workflows.find({ _id: { $in: ids }, status: "active", ownerId: { $ne: user.userId } }).sort({ updatedAt: -1 }).toArray();
  const owners = await users.find({ _id: { $in: docs.map((d) => d.ownerId) } }, { projection: { name: 1 } }).toArray();
  const nameOf = new Map(owners.map((o) => [o._id.toHexString(), o.name]));
  return docs.map((d) => toWorkflowDTO(d, accessFor("viewer", nameOf.get(d.ownerId.toHexString()) ?? null)));
}

// How many people each of these workflows is shared with, for the list's "Shared" marker.
export async function sharedCounts(workflowIds: string[]): Promise<Record<string, number>> {
  if (!workflowIds.length) return {};
  const { workflowShares } = await collections();
  const rows = await workflowShares
    .aggregate<{ _id: ObjectId; count: number }>([{ $match: { workflowId: { $in: workflowIds.map((id) => new ObjectId(id)) } } }, { $group: { _id: "$workflowId", count: { $sum: 1 } } }])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id.toHexString(), r.count]));
}
