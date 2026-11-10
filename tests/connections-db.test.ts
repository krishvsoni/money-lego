import { createHmac, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Sign-in, storage, refresh and routing against a real replica set, with every provider
// call answered by a fake. Opt in with TEST_MONGODB_URI (local only), like templates-db.
const uri = process.env.TEST_MONGODB_URI ?? "";
const local = /^mongodb:\/\/(localhost|127\.0\.0\.1)[:/]/.test(uri);

const calls = { refresh: 0, revoke: 0 };
vi.mock("@/server/oauth/http", async (original) => {
  const real = await original<typeof import("@/server/oauth/http")>();
  return {
    ...real,
    oauthRequest: vi.fn(async (r: { url: string; form?: Record<string, string> }) => {
      if (r.url === "https://oauth2.googleapis.com/token" && r.form?.grant_type === "refresh_token") {
        calls.refresh++;
        await new Promise((res) => setTimeout(res, 150));
        return { access_token: `ya29.refreshed-${calls.refresh}`, expires_in: 3600 };
      }
      if (r.url === "https://oauth2.googleapis.com/token") {
        return { access_token: "ya29.first-access-token", refresh_token: "1//refresh-token", expires_in: 3600, scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets.readonly" };
      }
      if (r.url.includes("openidconnect.googleapis.com")) return { sub: "google-user-1", email: "operator@example.com" };
      if (r.url === "https://oauth2.googleapis.com/revoke") {
        calls.revoke++;
        return {};
      }
      throw new Error(`unexpected call ${r.url}`);
    }),
  };
});

describe.skipIf(!local)("connections against MongoDB", () => {
  const user = { userId: new ObjectId(), name: "Test Studio", kind: "clerk" as const, email: null };
  const other = { userId: new ObjectId(), name: "Other Studio", kind: "clerk" as const, email: null };
  let m: {
    collections: typeof import("@/server/db/collections").collections;
    mongoClient: typeof import("@/server/db/client").mongoClient;
    flow: typeof import("@/server/oauth/flow");
    store: typeof import("@/server/oauth/store");
    creds: typeof import("@/server/workflows/credentials");
    platform: typeof import("@/server/engine/inbound/platform");
  };

  beforeAll(async () => {
    Object.assign(process.env, {
      MONGODB_URI: uri,
      MONGODB_DB: `money_lego_test_conn_${Date.now()}`,
      APP_URL: "https://money-lego.example",
      CREDENTIALS_KEYRING: `k1:${randomBytes(32).toString("base64")}`,
      CREDENTIALS_KEY: randomBytes(32).toString("base64"),
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      STRIPE_CLIENT_ID: "ca_test",
      STRIPE_SECRET_KEY: "sk_test_platform",
      STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_platform_secret",
    });
    m = {
      collections: (await import("@/server/db/collections")).collections,
      mongoClient: (await import("@/server/db/client")).mongoClient,
      flow: await import("@/server/oauth/flow"),
      store: await import("@/server/oauth/store"),
      creds: await import("@/server/workflows/credentials"),
      platform: await import("@/server/engine/inbound/platform"),
    };
  });

  afterAll(async () => {
    if (!m) return;
    await (await m.collections()).db.dropDatabase();
    await m.mongoClient().close();
  });

  const signIn = async (who: typeof user, finisher: typeof user | null) => {
    const url = new URL(await m.flow.startConnection(who, "google", { returnTo: "/workflows", popup: true, shop: null }));
    const query = new URLSearchParams({ state: url.searchParams.get("state")!, code: "auth-code" });
    return { query, result: await m.flow.completeConnection(finisher, "google", query) };
  };

  it("only the signed-in user who started a sign-in can finish it, and only once", async () => {
    const hijack = await signIn(user, other);
    expect(hijack.result.ok).toBe(false);
    expect(await m.flow.completeConnection(user, "google", hijack.query).then((r) => r.ok)).toBe(false);
    expect(await (await m.collections()).credentials.countDocuments({})).toBe(0);
  });

  it("stores the connection encrypted, bound to its row, and never returns the token", async () => {
    const { result } = await signIn(user, user);
    expect(result).toMatchObject({ ok: true, returnTo: "/workflows", popup: true });
    const doc = (await (await m.collections()).credentials.findOne({ ownerId: user.userId }))!;
    expect(doc.secret.startsWith("ev1.k1.")).toBe(true);
    expect(JSON.stringify(doc)).not.toContain("ya29.first-access-token");
    expect(JSON.stringify(doc)).not.toContain("1//refresh-token");
    const [dto] = await m.creds.listCredentials(user);
    expect(dto).toMatchObject({ type: "google_account", account: { name: "operator@example.com" }, missingScopes: [] });
    expect(JSON.stringify(dto)).not.toContain("ya29");

    const { result: again } = await signIn(user, user);
    expect(again.ok).toBe(true);
    const all = await (await m.collections()).credentials.find({ ownerId: user.userId }).toArray();
    expect(all).toHaveLength(1);
    expect(all[0]._id.equals(doc._id)).toBe(true);
  });

  it("never lets one user's workflow use another user's connection", async () => {
    const doc = (await (await m.collections()).credentials.findOne({ ownerId: user.userId }))!;
    await expect(m.store.openConnection(other.userId, doc._id.toHexString(), "google_account")).rejects.toThrow(/no longer exists/);
  });

  it("refreshes an expired token once, however many runs ask at the same moment", async () => {
    const c = await m.collections();
    const doc = (await c.credentials.findOne({ ownerId: user.userId }))!;
    const expired = { accessToken: "ya29.old", refreshToken: "1//refresh-token", expiresAt: Date.now() - 1000 };
    await c.credentials.updateOne({ _id: doc._id }, { $set: { secret: m.store.sealFor(doc, expired) } });
    calls.refresh = 0;
    const results = await Promise.all(Array.from({ length: 5 }, () => m.store.openConnection(user.userId, doc._id.toHexString(), "google_account")));
    expect(calls.refresh).toBe(1);
    expect(new Set(results.map((r) => r.secret.accessToken))).toEqual(new Set(["ya29.refreshed-1"]));
  });

  it("disconnecting revokes at the provider and deletes the local copy", async () => {
    const doc = (await (await m.collections()).credentials.findOne({ ownerId: user.userId }))!;
    calls.revoke = 0;
    await m.creds.deleteCredential(user, doc._id.toHexString());
    expect(calls.revoke).toBe(1);
    expect(await (await m.collections()).credentials.countDocuments({ ownerId: user.userId })).toBe(0);
  });

  it("routes a verified Stripe event to the subscribed workflow only, once per event", async () => {
    const c = await m.collections();
    const wf = async (route: string) => {
      const _id = new ObjectId();
      const now = new Date();
      await c.workflows.insertOne({
        _id,
        ownerId: user.userId,
        name: route,
        status: "active",
        enabled: true,
        currentVersion: 1,
        graph: {
          schemaVersion: 1,
          nodes: [
            { id: "t", type: "trigger.stripe", position: { x: 0, y: 0 }, config: { credentialId: new ObjectId().toHexString(), eventType: "invoice.paid" } },
            { id: "l", type: "util.log", position: { x: 300, y: 0 }, config: { message: "paid" } },
          ],
          edges: [{ id: "e", source: "t", sourcePort: "main", target: "l", targetPort: "main" }],
        },
        triggerType: "trigger.stripe",
        webhookKey: randomBytes(18).toString("base64url"),
        schedule: null,
        runCount: 0,
        lastRunAt: null,
        inboundRoute: route,
        createdAt: now,
        updatedAt: now,
      });
      return _id;
    };
    const mine = await wf("stripe:acct_1");
    const theirs = await wf("stripe:acct_2");
    const body = JSON.stringify({ id: "evt_42", type: "invoice.paid", account: "acct_1", livemode: false, data: { object: { id: "in_1", status: "paid" } } });
    const t = Math.floor(Date.now() / 1000);
    const headers = new Headers({ "stripe-signature": `t=${t},v1=${createHmac("sha256", "whsec_platform_secret").update(`${t}.${body}`).digest("hex")}` });
    await m.platform.receiveStripe(Buffer.from(body), headers);
    await m.platform.receiveStripe(Buffer.from(body), headers);
    expect(await c.workflowRuns.countDocuments({ workflowId: mine })).toBe(1);
    expect(await c.workflowRuns.countDocuments({ workflowId: theirs })).toBe(0);
    await expect(m.platform.receiveStripe(Buffer.from(body), new Headers({ "stripe-signature": `t=${t},v1=${"0".repeat(64)}` }))).rejects.toThrow();
  });
});
