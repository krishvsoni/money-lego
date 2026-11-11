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
  const owner = { userId: new ObjectId(), name: "Owner", kind: "kinde" as const, email: null };
  const stranger = { userId: new ObjectId(), name: "Stranger", kind: "kinde" as const, email: null };

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

  it("reports data beyond each source's limit instead of silently dropping it, per owner", async () => {
    const c = await mod.collections();
    const busy = { userId: new ObjectId(), name: "Busy", kind: "clerk" as const, email: null };
    const quiet = { userId: new ObjectId(), name: "Quiet", kind: "clerk" as const, email: null };
    const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
    const flowOf = (ownerId: ObjectId, key: string) => ({
      _id: new ObjectId(), ownerId, name: `Flow ${key}`, status: "active" as const, enabled: false, currentVersion: 1,
      graph: { schemaVersion: 1 as const, nodes: [], edges: [] }, triggerType: null, webhookKey: `${key}-key-0123456789`, schedule: null,
      runCount: 0, lastRunAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const busyFlow = flowOf(busy.userId, "busy");
    const quietFlow = flowOf(quiet.userId, "quiet");
    await c.workflows.insertMany([busyFlow, quietFlow]);

    const captures = (ownerId: ObjectId, workflowId: ObjectId, prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        _id: new ObjectId(), ownerId, workflowId, runId: null, nodeId: null, kind: "capture" as const, paypalId: `${prefix}CAP${i}`, status: "COMPLETED",
        currency: "USD", amountMinor: "100", counterparty: null, detail: {}, environment: "sandbox" as const, createdAt: minutesAgo(i + 1), updatedAt: minutesAgo(i + 1),
      }));
    const disputes = (workflowId: ObjectId, prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        _id: `WH-${prefix}-${i}`, eventType: "CUSTOMER.DISPUTE.CREATED", resourceType: "dispute", resourceId: `${prefix}DIS${i}`, reference: null, verified: true,
        summary: {}, routed: [{ workflowId, runId: null }], outcome: "updated" as const, receivedAt: minutesAgo(i + 1),
      }));
    const runs = (ownerId: ObjectId, workflowId: ObjectId, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        _id: new ObjectId(), ownerId, workflowId, workflowName: "Flow", workflowVersion: 1, graph: { schemaVersion: 1 as const, nodes: [], edges: [] },
        trigger: { type: "manual", key: `manual:${i}`, payload: null, at: minutesAgo(i + 1) }, status: "succeeded" as const, waiting: null, log: [], error: null,
        lease: null, nextWakeAt: null, version: 1, startedAt: minutesAgo(i + 1), finishedAt: minutesAgo(i + 1), updatedAt: minutesAgo(i + 1),
      }));

    const limits = { resources: 3, events: 3, runs: 3 };
    // The busy owner is one record over every limit; the quiet one sits exactly at each limit.
    await c.paypalResources.insertMany([...captures(busy.userId, busyFlow._id, "BUSY", 4), ...captures(quiet.userId, quietFlow._id, "QUIET", 3)]);
    await c.paypalEvents.insertMany([...disputes(busyFlow._id, "BUSY", 4), ...disputes(quietFlow._id, "QUIET", 3)]);
    await c.workflowRuns.insertMany([...runs(busy.userId, busyFlow._id, 4), ...runs(quiet.userId, quietFlow._id, 3)] as never);

    const quietTimeline = await mod.paymentTimeline(quiet, 7, limits);
    expect(quietTimeline.truncation).toBeNull();
    expect(quietTimeline.milestones).toHaveLength(9);
    expect(JSON.stringify(quietTimeline)).not.toContain("BUSY");

    const busyTimeline = await mod.paymentTimeline(busy, 7, limits);
    expect(busyTimeline.truncation?.sources).toEqual([
      { source: "resources", limit: 3 },
      { source: "events", limit: 3 },
      { source: "runs", limit: 3 },
    ]);
    // The newest three of each are kept; the timeline says it's complete from the oldest kept.
    expect(busyTimeline.milestones).toHaveLength(9);
    expect(Date.parse(busyTimeline.truncation!.completeSince)).toBeGreaterThan(Date.now() - 4 * 60_000);
    expect(JSON.stringify(busyTimeline)).not.toContain("QUIET");

    // One source over its limit is reported on its own.
    expect((await mod.paymentTimeline(busy, 7, { resources: 10, events: 10, runs: 3 })).truncation?.sources).toEqual([{ source: "runs", limit: 3 }]);
    expect((await mod.paymentTimeline(busy, 7, { resources: 10, events: 3, runs: 10 })).truncation?.sources).toEqual([{ source: "events", limit: 3 }]);
    expect((await mod.paymentTimeline(busy, 7, { resources: 3, events: 10, runs: 10 })).truncation?.sources).toEqual([{ source: "resources", limit: 3 }]);
  });
});
