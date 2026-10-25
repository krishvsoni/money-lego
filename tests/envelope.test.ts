import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

process.env.MONGODB_URI ??= "mongodb://localhost:27017";
const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");
process.env.CREDENTIALS_KEY = randomBytes(32).toString("base64");

type Envelope = typeof import("@/server/crypto/envelope");
let ev: Envelope;
const env = async (keyring: string) => {
  process.env.CREDENTIALS_KEYRING = keyring;
  (await import("@/server/config/env")).resetEnvForTests();
  ev = await import("@/server/crypto/envelope");
  ev.resetKeyringForTests();
};

const aad = "credential:owner-a:cred-1:google_account";
const TOKEN = "ya29.super-secret-access-token-value";

describe("envelope encryption", () => {
  beforeEach(async () => env(`k1:${k1}`));

  it("round-trips and never stores the plaintext or the data key in the clear", () => {
    const sealed = ev.sealSecret(TOKEN, aad);
    expect(sealed.startsWith("ev1.k1.")).toBe(true);
    expect(sealed).not.toContain(TOKEN);
    expect(ev.openSecret(sealed, aad)).toBe(TOKEN);
    expect(ev.sealSecret(TOKEN, aad)).not.toBe(sealed);
  });

  it("refuses to decrypt in another user's row, another row or another kind", () => {
    const sealed = ev.sealSecret(TOKEN, aad);
    expect(() => ev.openSecret(sealed, "credential:owner-b:cred-1:google_account")).toThrow();
    expect(() => ev.openSecret(sealed, "credential:owner-a:cred-2:google_account")).toThrow();
    expect(() => ev.openSecret(sealed, "credential:owner-a:cred-1:airtable_account")).toThrow();
  });

  it("detects tampering in either layer", () => {
    const [v, kid, wrapped, ct] = ev.sealSecret(TOKEN, aad).split(".");
    const flip = (s: string) => (s[5] === "A" ? `${s.slice(0, 5)}B${s.slice(6)}` : `${s.slice(0, 5)}A${s.slice(6)}`);
    expect(() => ev.openSecret([v, kid, flip(wrapped), ct].join("."), aad)).toThrow();
    expect(() => ev.openSecret([v, kid, wrapped, flip(ct)].join("."), aad)).toThrow();
  });

  it("rotates keys without downtime: old ciphertexts still open, new ones use the new key", async () => {
    const old = ev.sealSecret(TOKEN, aad);
    await env(`k2:${k2},k1:${k1}`);
    expect(ev.openSecret(old, aad)).toBe(TOKEN);
    expect(ev.needsRewrap(old)).toBe(true);
    const fresh = ev.sealSecret(TOKEN, aad);
    expect(fresh.startsWith("ev1.k2.")).toBe(true);
    expect(ev.needsRewrap(fresh)).toBe(false);
  });

  it("can't open anything once its key is removed from the keyring", async () => {
    const old = ev.sealSecret(TOKEN, aad);
    await env(`k2:${k2}`);
    expect(() => ev.openSecret(old, aad)).toThrow();
  });

  it("rejects malformed keyrings", async () => {
    await env("k1:short");
    expect(() => ev.sealSecret(TOKEN, aad)).toThrow(/32 bytes/);
  });
});
