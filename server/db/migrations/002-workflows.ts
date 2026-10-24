import type { Db, Document } from "mongodb";
import { COLLECTIONS } from "../names";

const RUN_STATUS = ["queued", "running", "waiting", "succeeded", "failed", "cancelled"];
const NODE_STATUS = ["pending", "running", "waiting", "succeeded", "failed", "skipped", "cancelled"];

const validators: Record<string, Document> = {
  [COLLECTIONS.workflows]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["ownerId", "name", "status", "enabled", "currentVersion", "graph", "webhookKey", "createdAt", "updatedAt"],
      properties: {
        ownerId: { bsonType: "objectId" },
        name: { bsonType: "string", minLength: 1, maxLength: 80 },
        status: { enum: ["active", "archived"] },
        enabled: { bsonType: "bool" },
        currentVersion: { bsonType: "int", minimum: 1 },
        graph: { bsonType: "object", required: ["schemaVersion", "nodes", "edges"], properties: { nodes: { bsonType: "array", maxItems: 60 } } },
        webhookKey: { bsonType: "string", minLength: 24 },
      },
    },
  },
  [COLLECTIONS.workflowVersions]: {
    $jsonSchema: { bsonType: "object", required: ["workflowId", "ownerId", "version", "graph", "createdAt"], properties: { version: { bsonType: "int", minimum: 1 } } },
  },
  [COLLECTIONS.workflowRuns]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["ownerId", "workflowId", "graph", "trigger", "status", "version", "startedAt"],
      properties: { status: { enum: RUN_STATUS }, version: { bsonType: "int", minimum: 0 }, log: { bsonType: "array", maxItems: 200 } },
    },
  },
  [COLLECTIONS.nodeRuns]: {
    $jsonSchema: { bsonType: "object", required: ["runId", "ownerId", "nodeId", "status", "attempts"], properties: { status: { enum: NODE_STATUS } } },
  },
  [COLLECTIONS.credentials]: {
    $jsonSchema: {
      bsonType: "object",
      required: ["ownerId", "type", "name", "secret", "createdAt"],
      properties: { type: { enum: ["webhook_secret", "discord_webhook", "slack_webhook", "http_header"] }, name: { bsonType: "string", maxLength: 60 } },
    },
  },
};

export const migration002 = {
  id: "002-workflows",
  async up(db: Db) {
    for (const [name, validator] of Object.entries(validators)) {
      const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
      const options = { validator, validationLevel: "strict", validationAction: "error" };
      if (!exists) await db.createCollection(name, options);
      else await db.command({ collMod: name, ...options });
    }

    const workflows = db.collection(COLLECTIONS.workflows);
    await workflows.createIndex({ ownerId: 1, status: 1, updatedAt: -1 }, { name: "owner_status_recent" });
    await workflows.createIndex({ webhookKey: 1 }, { unique: true, name: "webhook_key_unique" });
    // Only enabled scheduled workflows carry schedule.nextAt, so the due-schedule scan
    // touches a handful of entries no matter how many workflows exist.
    await workflows.createIndex(
      { "schedule.nextAt": 1 },
      { name: "schedule_queue", partialFilterExpression: { enabled: true, "schedule.nextAt": { $type: "date" } } },
    );

    await db.collection(COLLECTIONS.workflowVersions).createIndex({ workflowId: 1, version: 1 }, { unique: true, name: "workflow_version_unique" });

    const runs = db.collection(COLLECTIONS.workflowRuns);
    // A trigger delivery maps to exactly one run: webhook retries and double-clicked
    // test runs hit this index instead of starting a second payout.
    await runs.createIndex({ workflowId: 1, "trigger.key": 1 }, { unique: true, name: "trigger_idempotency" });
    await runs.createIndex({ workflowId: 1, startedAt: -1 }, { name: "workflow_recent" });
    await runs.createIndex({ ownerId: 1, startedAt: -1 }, { name: "owner_recent" });
    await runs.createIndex({ nextWakeAt: 1 }, { name: "wake_queue", partialFilterExpression: { nextWakeAt: { $type: "date" } } });

    await db.collection(COLLECTIONS.nodeRuns).createIndex({ runId: 1, nodeId: 1 }, { unique: true, name: "run_node_unique" });
    await db.collection(COLLECTIONS.credentials).createIndex({ ownerId: 1, type: 1 }, { name: "owner_type" });
    await db.collection(COLLECTIONS.executions).createIndex(
      { "source.workflowRunId": 1 },
      { name: "by_workflow_run", partialFilterExpression: { "source.workflowRunId": { $type: "objectId" } } },
    );
  },
};
