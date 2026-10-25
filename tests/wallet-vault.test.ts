import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

process.env.MONGODB_URI ??= "mongodb://localhost:27017";
process.env.CREDENTIALS_KEY = randomBytes(32).toString("base64");

const WALLET = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
let vault: typeof import("@/server/crypto/wallet-vault");

beforeAll(async () => {
  vault = await import("@/server/crypto/wallet-vault");
});

describe("wallet vault", () => {
  it("round-trips and never contains the plaintext", () => {
    const sealed = vault.sealWallet(WALLET, "users.wallet");
    expect(sealed).not.toContain(WALLET);
    expect(Buffer.from(sealed, "base64").toString("latin1")).not.toContain(WALLET);
    expect(vault.openWallet(sealed, "users.wallet")).toBe(WALLET);
  });

  it("uses a fresh IV, so equal wallets don't produce equal ciphertexts", () => {
    expect(vault.sealWallet(WALLET, "users.wallet")).not.toBe(vault.sealWallet(WALLET, "users.wallet"));
  });

  it("binds the ciphertext to its field", () => {
    const sealed = vault.sealWallet(WALLET, "users.wallet");
    expect(() => vault.openWallet(sealed, "sessions.wallet")).toThrow(/went wrong/);
  });

  it("rejects tampered ciphertext without leaking crypto detail", () => {
    const raw = Buffer.from(vault.sealWallet(WALLET, "users.wallet"), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => vault.openWallet(raw.toString("base64"), "users.wallet")).toThrow(/^Something went wrong on our side/);
  });

  it("indexes deterministically under a key, not as a plain hash", async () => {
    const { createHash } = await import("node:crypto");
    const index = vault.walletIndex(WALLET);
    expect(index).toMatch(/^[a-f0-9]{64}$/);
    expect(vault.walletIndex(WALLET)).toBe(index);
    expect(index).not.toBe(createHash("sha256").update(WALLET).digest("hex"));
    expect(vault.walletIndex(WALLET.slice(0, -1) + "x")).not.toBe(index);
  });

  it("masks for display", () => {
    expect(vault.maskWallet(WALLET)).toBe("9xQe…VFin");
  });
});
