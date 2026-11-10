import "server-only";
import type { Db, IndexDescription } from "mongodb";
import { log } from "../log";
import { COLLECTIONS, EMAIL_COLLATION } from "./names";

// Indexes are declared here and created on connect with the official mongodb driver. createIndexes
// is idempotent and allowed for a plain readWrite user, so there is no migration step.
// Shapes and invariants are enforced in the app with zod, not by database validators.

const INDEXES: Record<string, IndexDescription[]> = {
  [COLLECTIONS.users]: [
    { key: { identityKey: 1 }, name: "identity_unique", unique: true },
    // Sharing looks members up by address, whatever its capitalisation.
    { key: { email: 1 }, name: "email_ci", collation: EMAIL_COLLATION },
  ],
  // TTL indexes: Mongo's background monitor deletes expired rows, so no instance runs a cleanup job.
  [COLLECTIONS.rateLimits]: [{ key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 0 }],
  [COLLECTIONS.locks]: [{ key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 300 }],
  [COLLECTIONS.paypalEvents]: [
    { key: { receivedAt: -1 }, name: "recent" },
    { key: { reference: 1, receivedAt: -1 }, name: "by_reference" },
    { key: { receivedAt: 1 }, name: "ttl_180d", expireAfterSeconds: 60 * 60 * 24 * 180 },
  ],
  [COLLECTIONS.paypalResources]: [
    // One local row per PayPal object, however many times we see it.
    { key: { kind: 1, paypalId: 1 }, name: "kind_paypal_id_unique", unique: true },
    { key: { ownerId: 1, updatedAt: -1 }, name: "owner_recent" },
    { key: { runId: 1 }, name: "by_run", partialFilterExpression: { runId: { $type: "objectId" } } },
  ],
  [COLLECTIONS.workflows]: [
    { key: { ownerId: 1, status: 1, updatedAt: -1 }, name: "owner_status_recent" },
    { key: { webhookKey: 1 }, name: "webhook_key_unique", unique: true },
    { key: { "schedule.nextAt": 1 }, name: "schedule_queue", partialFilterExpression: { enabled: true, "schedule.nextAt": { $type: "date" } } },
    { key: { inboundRoute: 1 }, name: "inbound_route", partialFilterExpression: { enabled: true, inboundRoute: { $type: "string" } } },
    // A double-clicked "Use template" with the same request key creates one workflow.
    { key: { ownerId: 1, createRequestKey: 1 }, name: "owner_create_request_unique", unique: true, partialFilterExpression: { createRequestKey: { $type: "string" } } },
  ],
  [COLLECTIONS.workflowShares]: [
    // Sharing with the same address twice is one share.
    { key: { workflowId: 1, email: 1 }, name: "workflow_email_unique", unique: true },
    { key: { email: 1 }, name: "by_email" },
  ],
  [COLLECTIONS.workflowVersions]: [{ key: { workflowId: 1, version: 1 }, name: "workflow_version_unique", unique: true }],
  [COLLECTIONS.workflowRuns]: [
    // A trigger delivery maps to exactly one run, so retries never start a second payout.
    { key: { workflowId: 1, "trigger.key": 1 }, name: "trigger_idempotency", unique: true },
    { key: { workflowId: 1, startedAt: -1 }, name: "workflow_recent" },
    { key: { ownerId: 1, startedAt: -1 }, name: "owner_recent" },
    { key: { nextWakeAt: 1 }, name: "wake_queue", partialFilterExpression: { nextWakeAt: { $type: "date" } } },
  ],
  [COLLECTIONS.nodeRuns]: [{ key: { runId: 1, nodeId: 1 }, name: "run_node_unique", unique: true }],
  [COLLECTIONS.credentials]: [
    { key: { ownerId: 1, type: 1 }, name: "owner_type" },
    // Reconnecting the same account updates its connection instead of adding a second one.
    { key: { ownerId: 1, type: 1, "account.id": 1 }, name: "owner_account_unique", unique: true, partialFilterExpression: { "account.id": { $type: "string" } } },
    // Platform webhooks find the connections for a Stripe account, store or Discord server.
    { key: { type: 1, "account.id": 1 }, name: "type_account" },
  ],
  [COLLECTIONS.oauthStates]: [{ key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 0 }],
  [COLLECTIONS.telegramLinks]: [{ key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 0 }],
  [COLLECTIONS.workflowTemplates]: [
    { key: { slug: 1 }, name: "slug_unique", unique: true },
    { key: { isPublished: 1, category: 1 }, name: "published_category" },
  ],
  [COLLECTIONS.onceKeys]: [{ key: { workflowId: 1, key: 1 }, name: "workflow_key_unique", unique: true }],
};

export async function ensureIndexes(db: Db): Promise<void> {
  const results = await Promise.allSettled(Object.entries(INDEXES).map(([name, specs]) => db.collection(name).createIndexes(specs)));
  // An index that can't be built (e.g. an older one with the same name) is logged, not fatal:
  // the app still serves, and the log says which collection needs attention.
  results.forEach((r, i) => {
    if (r.status === "rejected") log.warn("db.index_failed", { collection: Object.keys(INDEXES)[i], error: r.reason });
  });
}
