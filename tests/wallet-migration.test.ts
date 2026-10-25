import { randomBytes } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the local Docker replica set only (bun run db:up), in a throwaway database.
// Skips when it isn't reachable; it never reads the app's .env files.
const LOCAL_URI = "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
process.env.MONGODB_URI = LOCAL_URI;
process.env.CREDENTIALS_KEY = randomBytes(32).toString("base64");

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
let client: MongoClient | null = null;
let db: Db;

beforeAll(async () => {
  try {
    client = await new MongoClient(LOCAL_URI, { serverSelectionTimeoutMS: 1500 }).connect();
  } catch {
    client = null;
    return;
  }
  db = client.db(`ml_test_wallets_${randomBytes(4).toString("hex")}`);
  const { migration001 } = await import("@/server/db/migrations/001-schema");
  await migration001.up(db);
  await db.collection("users").insertOne({ wallet: WALLET, createdAt: new Date(), lastSignedInAt: new Date() });
  await db.collection("sessions").insertOne({ _id: "s1" as unknown as ObjectId, userId: new ObjectId(), wallet: WALLET, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
  await db.collection("auth_nonces").insertOne({ _id: "n1" as unknown as ObjectId, wallet: WALLET, expiresAt: new Date(Date.now() + 60_000) });
  await db.collection("node_runs").insertOne({ nodeType: "logic.approval", waitState: { by: WALLET }, output: { approval: { by: WALLET } } });
});

afterAll(async () => {
  if (client) {
    await db.dropDatabase();
    await client.close();
  }
});

describe("003 encrypt wallets", () => {
  it("converts legacy plaintext and is safe to re-run", async (ctx) => {
    if (!client) return ctx.skip();
    const { migration003 } = await import("@/server/db/migrations/003-encrypt-wallets");
    const { openWallet, walletIndex } = await import("@/server/crypto/wallet-vault");
    await migration003.up(db);
    await migration003.up(db);

    const user = await db.collection("users").findOne({});
    expect(user?.wallet).toBeUndefined();
    expect(user?.walletHash).toBe(walletIndex(WALLET));
    expect(openWallet(user?.walletEnc, "users.wallet")).toBe(WALLET);

    const session = await db.collection("sessions").findOne({});
    expect(session?.wallet).toBeUndefined();
    expect(openWallet(session?.walletEnc, "sessions.wallet")).toBe(WALLET);

    expect(await db.collection("auth_nonces").countDocuments()).toBe(0);
    const approval = await db.collection("node_runs").findOne({});
    expect(approval?.waitState.by).toBe("9xQe…VFin");
    expect(approval?.output.approval.by).toBe("9xQe…VFin");

    const dump = JSON.stringify(await Promise.all(["users", "sessions", "node_runs"].map((c) => db.collection(c).find({}).toArray())));
    expect(dump).not.toContain(WALLET);
  });

  it("refuses plaintext wallets and duplicate accounts at the database", async (ctx) => {
    if (!client) return ctx.skip();
    const { walletIndex, sealWallet } = await import("@/server/crypto/wallet-vault");
    const users = db.collection("users");
    await expect(users.insertOne({ wallet: WALLET, createdAt: new Date(), lastSignedInAt: new Date() })).rejects.toThrow(/validation/i);
    await expect(
      users.insertOne({ walletHash: walletIndex(WALLET), walletEnc: sealWallet(WALLET, "users.wallet"), createdAt: new Date(), lastSignedInAt: new Date() }),
    ).rejects.toThrow(/duplicate key/i);
    await expect(
      db.collection("sessions").insertOne({ userId: new ObjectId(), wallet: WALLET, walletEnc: sealWallet(WALLET, "sessions.wallet"), expiresAt: new Date() }),
    ).rejects.toThrow(/validation/i);
  });
});
