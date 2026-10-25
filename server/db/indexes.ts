import "server-only";
import type { Db, IndexDescription } from "mongodb";
import { log } from "../log";
import { COLLECTIONS } from "./names";

// Indexes are declared here and created on connect with the official mongodb driver. createIndexes
// is idempotent and allowed for a plain readWrite user, so there is no migration step.
// Shapes and invariants are enforced in the app with zod, not by database validators.

const INDEXES: Record<string, IndexDescription[]> = {
  [COLLECTIONS.users]: [{ key: { walletHash: 1 }, name: "wallet_hash_unique", unique: true }],
  // TTL indexes: Mongo's background monitor deletes expired rows, so no instance runs a cleanup job.
  [COLLECTIONS.nonces]: [{ key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 0 }],
  [COLLECTIONS.sessions]: [
    { key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 0 },
    { key: { userId: 1 }, name: "by_user" },
  ],
  [COLLECTIONS.rateLimits]: [{ key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 0 }],
  [COLLECTIONS.locks]: [{ key: { expiresAt: 1 }, name: "ttl", expireAfterSeconds: 300 }],
  [COLLECTIONS.recipes]: [{ key: { ownerId: 1, status: 1, updatedAt: -1 }, name: "owner_status_recent" }],
  [COLLECTIONS.recipeVersions]: [{ key: { recipeId: 1, version: 1 }, name: "recipe_version_unique", unique: true }],
  [COLLECTIONS.executions]: [
    { key: { externalId: 1 }, name: "external_id_unique", unique: true },
    { key: { ownerId: 1, requestKey: 1 }, name: "owner_request_unique", unique: true },
    { key: { shareToken: 1 }, name: "share_token_unique", unique: true },
    { key: { ownerId: 1, createdAt: -1 }, name: "owner_recent" },
    { key: { recipeId: 1, createdAt: -1 }, name: "recipe_recent" },
    { key: { providerTransferId: 1 }, name: "provider_transfer_unique", unique: true, partialFilterExpression: { providerTransferId: { $type: "int" } } },
    { key: { nextCheckAt: 1 }, name: "reconcile_queue", partialFilterExpression: { nextCheckAt: { $type: "date" } } },
    { key: { "source.workflowRunId": 1 }, name: "by_workflow_run", partialFilterExpression: { "source.workflowRunId": { $type: "objectId" } } },
  ],
  [COLLECTIONS.webhookEvents]: [
    { key: { dedupeKey: 1 }, name: "dedupe_unique", unique: true },
    { key: { receivedAt: 1 }, name: "ttl_90d", expireAfterSeconds: 60 * 60 * 24 * 90 },
  ],
  [COLLECTIONS.workflows]: [
    { key: { ownerId: 1, status: 1, updatedAt: -1 }, name: "owner_status_recent" },
    { key: { webhookKey: 1 }, name: "webhook_key_unique", unique: true },
    { key: { "schedule.nextAt": 1 }, name: "schedule_queue", partialFilterExpression: { enabled: true, "schedule.nextAt": { $type: "date" } } },
    { key: { inboundRoute: 1 }, name: "inbound_route", partialFilterExpression: { enabled: true, inboundRoute: { $type: "string" } } },
    // A double-clicked "Use template" with the same request key creates one workflow.
    { key: { ownerId: 1, createRequestKey: 1 }, name: "owner_create_request_unique", unique: true, partialFilterExpression: { createRequestKey: { $type: "string" } } },
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
