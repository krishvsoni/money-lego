import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Owner isolation against a real MongoDB. Opt in with TEST_MONGODB_URI pointing at the local
// docker replica set; it refuses anything that isn't local and drops its database afterwards.
const uri = process.env.TEST_MONGODB_URI ?? "";
const local = /^mongodb:\/\/(localhost|127\.0\.0\.1)[:/]/.test(uri);
const dbName = `money_lego_test_timeline_${Date.now()}`;

describe.skipIf(!local)("payment timeline against MongoDB", () => {
  let mod: {
    collections: typeof import("@/server/db/collections").collections;
    mongoClient: typeof import("@/server/db/client").mongoClient;
    paymentTimeline: typeof import("@/server/paypal/timeline").paymentTimeline;
  };
  const owner = { userId: new ObjectId(), name: "Owner", kind: "clerk" as const, email: null };
  const stranger = { userId: new ObjectId(), name: "Stranger", kind: "clerk" as const, email: null };

  beforeAll(async () => {
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = dbName;
    mod = {
      collections: (await import("@/server/db/collections")).collections,
      mongoClient: (await import("@/server/db/client")).mongoClient,
      paymentTimeline: (await import("@/server/paypal/timeline")).paymentTimeline,
    };
  });

  afterAll(async () => {
    if (!mod) return;
    await (await mod.collections()).db.dropDatabase();
    await mod.mongoClient().close();
  });

  it("shows each owner only their own objects, webhook events and runs", async () => {
    const c = await mod.collections();
    const now = new Date();
    const workflowOf = (ownerId: ObjectId, key: string) => ({
      _id: new ObjectId(), ownerId, name: `Flow ${key}`, status: "active" as const, enabled: false, currentVersion: 1,
      graph: { schemaVersion: 1 as const, nodes: [], edges: [] }, triggerType: null, webhookKey: `${key}-key-0123456789`, schedule: null,
      runCount: 0, lastRunAt: null, createdAt: now, updatedAt: now,
    });
    const mine = workflowOf(owner.userId, "mine");
    const theirs = workflowOf(stranger.userId, "theirs");
    await c.workflows.insertMany([mine, theirs]);

    const capture = (ownerId: ObjectId, workflowId: ObjectId, paypalId: string) => ({
      _id: new ObjectId(), ownerId, workflowId, runId: null, nodeId: null, kind: "capture" as const, paypalId, status: "COMPLETED",
      currency: "USD", amountMinor: "1000", counterparty: null, detail: {}, environment: "sandbox" as const, createdAt: now, updatedAt: now,
    });
    await c.paypalResources.insertMany([capture(owner.userId, mine._id, "MINECAPTURE01"), capture(stranger.userId, theirs._id, "THEIRCAPTURE1")]);

    const dispute = (id: string, resourceId: string, workflowId: ObjectId) => ({
      _id: id, eventType: "CUSTOMER.DISPUTE.CREATED", resourceType: "dispute", resourceId, reference: null, verified: true,
      summary: {}, routed: [{ workflowId, runId: null }], outcome: "updated" as const, receivedAt: now,
    });
    await c.paypalEvents.insertMany([dispute("WH-MINE", "MINEDISPUTE01", mine._id), dispute("WH-THEIRS", "THEIRDISPUTE1", theirs._id)]);

    const t = await mod.paymentTimeline(owner, 7);
    expect(t.milestones.map((m) => m.kind).sort()).toEqual(["capture", "dispute"]);
    expect(t.milestones.every((m) => m.workflowId === mine._id.toHexString())).toBe(true);
    expect(t.workflows.map((w) => w.id)).toEqual([mine._id.toHexString()]);
    expect(JSON.stringify(t)).not.toContain("THEIR");
  });
});
