import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against a real replica set (transactions, unique indexes). Opt in with
// TEST_MONGODB_URI pointing at the local docker rs0; it refuses anything that isn't local,
// so it can never write to a shared or production cluster. Each run uses a fresh database
// and drops it afterwards.
const uri = process.env.TEST_MONGODB_URI ?? "";
const local = /^mongodb:\/\/(localhost|127\.0\.0\.1)[:/]/.test(uri);
const dbName = `money_lego_test_${Date.now()}`;
const COUNT = 5;

describe.skipIf(!local)("templates against MongoDB", () => {
  let mod: {
    collections: typeof import("@/server/db/collections").collections;
    mongoClient: typeof import("@/server/db/client").mongoClient;
    seedTemplates: typeof import("@/server/templates/seed").seedTemplates;
    service: typeof import("@/server/workflows/service");
    runs: typeof import("@/server/engine/runs");
    once: typeof import("@/server/engine/executors/once");
  };
  const user = { userId: new ObjectId(), name: "Test Studio", kind: "clerk" as const };

  beforeAll(async () => {
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_DB = dbName;
    mod = {
      collections: (await import("@/server/db/collections")).collections,
      mongoClient: (await import("@/server/db/client")).mongoClient,
      seedTemplates: (await import("@/server/templates/seed")).seedTemplates,
      service: await import("@/server/workflows/service"),
      runs: await import("@/server/engine/runs"),
      once: await import("@/server/engine/executors/once"),
    };
  });

  afterAll(async () => {
    if (!mod) return;
    await (await mod.collections()).db.dropDatabase();
    await mod.mongoClient().close();
  });

  it("seeding twice leaves exactly the published templates, no duplicates, no new revision", async () => {
    const c = await mod.collections();
    const first = await mod.seedTemplates(c);
    const second = await mod.seedTemplates(c);
    expect(first.written).toHaveLength(COUNT);
    expect(second.written).toHaveLength(0);
    expect(second.unchanged).toHaveLength(COUNT);
    expect(await c.workflowTemplates.countDocuments({ isPublished: true })).toBe(COUNT);
    expect(new Set(await c.workflowTemplates.distinct("slug")).size).toBe(COUNT);
    expect(await c.workflowTemplates.countDocuments({ revision: 1 })).toBe(COUNT);
  });

  it("concurrent seeds from many instances still produce one document per slug", async () => {
    const c = await mod.collections();
    await c.workflowTemplates.deleteMany({});
    await Promise.all([mod.seedTemplates(c), mod.seedTemplates(c), mod.seedTemplates(c)]);
    expect(await c.workflowTemplates.countDocuments({})).toBe(COUNT);
  });

  it("imports a deep, user-owned, disabled copy and never mutates the template", async () => {
    const c = await mod.collections();
    const before = await c.workflowTemplates.findOne({ slug: "paypal-sale-revenue-split" });
    const requestKey = crypto.randomUUID();
    const [a, b] = await Promise.all([
      mod.service.createWorkflow(user, { templateSlug: "paypal-sale-revenue-split", requestKey }),
      mod.service.createWorkflow(user, { templateSlug: "paypal-sale-revenue-split", requestKey }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await c.workflows.countDocuments({ ownerId: user.userId })).toBe(1);
    expect(a.enabled).toBe(false);
    expect(a.sourceTemplate?.slug).toBe("paypal-sale-revenue-split");
    const doc = await c.workflows.findOne({ _id: new ObjectId(a.id) });
    expect(doc?.ownerId.equals(user.userId)).toBe(true);
    expect(doc?.sourceTemplate?.id.equals(before!._id)).toBe(true);
    expect(a.graph.edges).toEqual(before!.graphDefinition.edges);

    const edited = structuredClone(a.graph);
    edited.nodes[0].config.itemName = "Something else";
    await mod.service.saveWorkflow(user, a.id, { name: a.name, graph: edited, expectedVersion: a.version });
    const after = await c.workflowTemplates.findOne({ slug: "paypal-sale-revenue-split" });
    expect(after!.graphDefinition).toEqual(before!.graphDefinition);
    expect(after!.revision).toBe(before!.revision);
  });

  it("won't turn an imported workflow on while setup is missing", async () => {
    const w = await mod.service.createWorkflow(user, { templateSlug: "paypal-invoice-reminders" });
    await expect(mod.service.setWorkflowEnabled(user, w.id, true)).rejects.toThrow(/before turning this workflow on/);
  });

  it("starts one run per trigger delivery, however often it's redelivered", async () => {
    const c = await mod.collections();
    const blank = await mod.service.createWorkflow(user, { templateId: "blank" });
    const graph = {
      schemaVersion: 1 as const,
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, config: { samplePayload: "{}" } },
        { id: "l", type: "util.log", position: { x: 300, y: 0 }, config: { message: "hi" } },
      ],
      edges: [{ id: "e", source: "t", sourcePort: "main", target: "l", targetPort: "main" }],
    };
    await mod.service.saveWorkflow(user, blank.id, { name: "dup", graph, expectedVersion: blank.version });
    const wf = (await c.workflows.findOne({ _id: new ObjectId(blank.id) }))!;
    const deliveries = await Promise.all([1, 2, 3].map(() => mod.runs.createRun(wf, { type: "trigger.stripe", key: "stripe:evt_same", payload: {} })));
    expect(new Set(deliveries.map((d) => d.run._id.toHexString())).size).toBe(1);
    expect(deliveries.filter((d) => d.created)).toHaveLength(1);
  });

  it("lets exactly one of several racing runs claim a business key", async () => {
    const c = await mod.collections();
    const workflowId = new ObjectId();
    const runIds = [new ObjectId(), new ObjectId(), new ObjectId()];
    await c.workflowRuns.insertMany(runIds.map((_id) => ({ _id, workflowId, ownerId: user.userId, status: "running", trigger: { key: `manual:${_id.toHexString()}` } }) as never));
    const once = (runId: ObjectId) =>
      mod.once.onceExecutors["logic.once"]({ config: { key: "capture:3C679366HH908993F" }, input: {}, run: { _id: runId, workflowId } } as never).then(
        () => "claimed",
        () => "stopped",
      );
    const outcomes = await Promise.all(runIds.map(once));
    expect(outcomes.filter((o) => o === "claimed")).toHaveLength(1);

    // A run that failed before any PayPal money action releases its key to a retry; a live one never does.
    const winner = runIds[outcomes.indexOf("claimed")];
    expect(await once(runIds.find((r) => r !== winner)!)).toBe("stopped");
    await c.workflowRuns.updateOne({ _id: winner }, { $set: { status: "failed" } });
    expect(await once(runIds.find((r) => r !== winner)!)).toBe("claimed");
  });
});
