import { describe, expect, it } from "vitest";
import { recipeConfigSchema, totalRaw } from "@/lib/recipe-schema";

const USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const B = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

const base = { tokenMint: USDC, route: { mode: "standard" as const, hops: 3 } };

describe("recipeConfigSchema", () => {
  it("accepts a valid two-recipient payout", () => {
    const parsed = recipeConfigSchema.parse({
      ...base,
      destinations: [{ wallet: A, amountRaw: "1000000" }, { wallet: B, amountRaw: "2500000" }],
    });
    expect(totalRaw(parsed)).toBe(3_500_000n);
  });
  it("rejects duplicate wallets and points at the second row", () => {
    const result = recipeConfigSchema.safeParse({
      ...base,
      destinations: [{ wallet: A, amountRaw: "1" }, { wallet: A, amountRaw: "1" }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["destinations", 1, "wallet"]);
  });
  it("rejects zero, negative, decimal raw amounts and bad addresses", () => {
    for (const amountRaw of ["0", "-1", "1.5", "abc"]) {
      expect(recipeConfigSchema.safeParse({ ...base, destinations: [{ wallet: A, amountRaw }] }).success).toBe(false);
    }
    expect(recipeConfigSchema.safeParse({ ...base, destinations: [{ wallet: "not-a-wallet", amountRaw: "1" }] }).success).toBe(false);
  });
  it("enforces 1–20 recipients, hop bounds and the token allowlist", () => {
    expect(recipeConfigSchema.safeParse({ ...base, destinations: [] }).success).toBe(false);
    const many = Array.from({ length: 21 }, () => ({ wallet: A, amountRaw: "1" }));
    expect(recipeConfigSchema.safeParse({ ...base, destinations: many }).success).toBe(false);
    const one = [{ wallet: A, amountRaw: "1" }];
    expect(recipeConfigSchema.safeParse({ ...base, route: { mode: "standard", hops: 11 }, destinations: one }).success).toBe(false);
    expect(recipeConfigSchema.safeParse({ ...base, tokenMint: A, destinations: one }).success).toBe(false);
  });
});
