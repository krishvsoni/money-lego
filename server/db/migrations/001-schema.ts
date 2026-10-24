import type { Db, Document } from "mongodb";
import { COLLECTIONS } from "../collections";

// Server-side schema validation. The app validates with zod first; these validators are
// the last line of defence so that no code path, script or manual write can store a
// document that breaks an invariant the rest of the system relies on.

const rawAmount = { bsonType: "string", pattern: "^[0-9]+$" };
const wallet = { bsonType: "string", minLength: 32, maxLength: 44 };

const validators: Record<string, Document> = {
  [COLLECTIONS.users]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["wallet", "createdAt", "lastSignedInAt"],
      properties: { wallet, createdAt: { bsonType: "date" }, lastSignedInAt: { bsonType: "date" } },
    },
  },
  [COLLECTIONS.recipes]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["ownerId", "name", "status", "currentVersion", "config", "runCount", "createdAt", "updatedAt"],
      properties: {
        ownerId: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 80 },
        status: { enum: ["active", "archived"] },
        currentVersion: { bsonType: "int", minimum: 1 },
        runCount: { bsonType: "int", minimum: 0 },
        config: {
          bsonType: "object",
          required: ["tokenMint", "destinations", "route"],
          properties: {
            destinations: {
              bsonType: "array",
              minItems: 1,
              maxItems: 20,
              items: { bsonType: "object", required: ["wallet", "amountRaw"], properties: { wallet, amountRaw: rawAmount } },
            },
          },
        },
      },
    },
  },
  [COLLECTIONS.recipeVersions]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["recipeId", "ownerId", "version", "config", "createdAt"],
      properties: {
        recipeId: { bsonType: "objectId" },
        ownerId: { bsonType: "objectId" },
        version: { bsonType: "int", minimum: 1 },
      },
    },
  },
  [COLLECTIONS.executions]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["ownerId", "recipeId", "requestKey", "externalId", "state", "amountRaw", "snapshot", "version", "shareToken"],
      properties: {
        ownerId: { bsonType: "objectId" },
        recipeId: { bsonType: "objectId" },
        externalId: { bsonType: "string", pattern: "^[A-Za-z0-9._-]{1,64}$" },
        amountRaw: rawAmount,
        sourceWallet: wallet,
        version: { bsonType: "int", minimum: 0 },
        state: {
          enum: [
            "quoting", "quote_unknown", "quoted", "signing", "funded", "submitted",
            "processing", "completed", "failed", "expired", "refunded", "needs_check",
          ],
        },
        signatures: { bsonType: "array", maxItems: 64 },
        timeline: { bsonType: "array", maxItems: 60 },
      },
    },
  },
  [COLLECTIONS.webhookEvents]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["dedupeKey", "receivedAt", "outcome", "attempts"],
      properties: { dedupeKey: { bsonType: "string" }, outcome: { enum: ["pending", "applied", "ignored", "failed"] } },
    },
  },
};

async function ensureCollection(db: Db, name: string, validator?: Document) {
  const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
  const options = validator ? { validator, validationLevel: "strict", validationAction: "error" } : {};
  if (!exists) await db.createCollection(name, options);
  else if (validator) await db.command({ collMod: name, ...options });
}

export const migration001 = {
  id: "001-schema",
  async up(db: Db) {
    for (const name of Object.values(COLLECTIONS)) {
      if (name === COLLECTIONS.migrations) continue;
      await ensureCollection(db, name, validators[name]);
    }

    await db.collection(COLLECTIONS.users).createIndex({ wallet: 1 }, { unique: true, name: "wallet_unique" });

    // TTL indexes: Mongo's background monitor deletes expired nonces, sessions, rate-limit
    // windows and lapsed locks, so no instance has to run a cleanup job.
    await db.collection(COLLECTIONS.nonces).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" });
    await db.collection(COLLECTIONS.sessions).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" });
    await db.collection(COLLECTIONS.sessions).createIndex({ userId: 1 }, { name: "by_user" });
    await db.collection(COLLECTIONS.rateLimits).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl" });
    await db.collection(COLLECTIONS.locks).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 300, name: "ttl" });

    // Compound index that matches the dashboard query exactly: equality on owner and
    // status, then sort by recency. Equality-sort-range ordering keeps it a pure index scan.
    await db.collection(COLLECTIONS.recipes).createIndex({ ownerId: 1, status: 1, updatedAt: -1 }, { name: "owner_status_recent" });

    await db.collection(COLLECTIONS.recipeVersions).createIndex(
      { recipeId: 1, version: 1 },
      { unique: true, name: "recipe_version_unique" },
    );

    const executions = db.collection(COLLECTIONS.executions);
    await executions.createIndex({ externalId: 1 }, { unique: true, name: "external_id_unique" });
    await executions.createIndex({ ownerId: 1, requestKey: 1 }, { unique: true, name: "owner_request_unique" });
    await executions.createIndex({ shareToken: 1 }, { unique: true, name: "share_token_unique" });
    await executions.createIndex({ ownerId: 1, createdAt: -1 }, { name: "owner_recent" });
    await executions.createIndex({ recipeId: 1, createdAt: -1 }, { name: "recipe_recent" });
    // Partial indexes: only executions that reached MultiHopper have a transfer id, and only
    // unfinished ones need reconciling, so both indexes stay small as history grows.
    await executions.createIndex(
      { providerTransferId: 1 },
      { unique: true, name: "provider_transfer_unique", partialFilterExpression: { providerTransferId: { $type: "int" } } },
    );
    await executions.createIndex(
      { nextCheckAt: 1 },
      { name: "reconcile_queue", partialFilterExpression: { nextCheckAt: { $type: "date" } } },
    );

    const webhooks = db.collection(COLLECTIONS.webhookEvents);
    await webhooks.createIndex({ dedupeKey: 1 }, { unique: true, name: "dedupe_unique" });
    await webhooks.createIndex({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90, name: "ttl_90d" });
  },
};
