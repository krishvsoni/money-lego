import { describe, expect, it } from "vitest";
import { supportedTokens } from "@/lib/tokens";
import { isTimeZone, nextRunAt } from "@/lib/workflow/schedule";
import { buildPayout } from "@/server/engine/executors/payout";
import { payoutHash } from "@/server/engine/payload-hash";
import { escapeFormulaString, lookupFormula } from "@/server/integrations/airtable";
import { selectRows } from "@/server/integrations/google-sheets";
import { normalizeId, plainProperties } from "@/server/integrations/notion";

const mint = supportedTokens()[0].mint;
// Distinct valid base58 addresses (well-known program ids), never anyone's wallet.
const W = ["11111111111111111111111111111111", "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "SysvarRent111111111111111111111111111111111", "SysvarC1ock11111111111111111111111111111111"];
const opts = { tokenMint: mint, walletField: "wallet", amountField: "amount", labelField: "name" };

describe("payout rules", () => {
  it("builds an exact allocation in base units", () => {
    const p = buildPayout([{ wallet: W[0], amount: "60", name: "A" }, { wallet: W[1], amount: "25.5" }, { wallet: W[2], amount: "14.5" }], { ...opts, expectedTotal: "100" });
    expect(p.amountRaw).toBe("100000000");
    expect(p.destinations.map((d) => d.amountRaw)).toEqual(["60000000", "25500000", "14500000"]);
  });
  it("refuses more than 20 recipients instead of splitting", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ wallet: W[i % 5], amount: "1" }));
    expect(() => buildPayout(rows, opts)).toThrow(/more than the 20/);
  });
  it("refuses duplicate, invalid and missing wallets", () => {
    expect(() => buildPayout([{ wallet: W[0], amount: "1" }, { wallet: W[0], amount: "1" }], opts)).toThrow(/same wallet/);
    expect(() => buildPayout([{ wallet: "{{configure_wallet}}", amount: "1" }], opts)).toThrow(/valid Solana address/);
    expect(() => buildPayout([{ amount: "1" }], opts)).toThrow(/no wallet/);
  });
  it("refuses zero, negative, over-precise and non-numeric amounts", () => {
    expect(() => buildPayout([{ wallet: W[0], amount: "0" }], opts)).toThrow(/more than zero/);
    expect(() => buildPayout([{ wallet: W[0], amount: "-5" }], opts)).toThrow(/isn't a USDC amount/);
    expect(() => buildPayout([{ wallet: W[0], amount: "1.0000001" }], opts)).toThrow(/at most 6 decimals/);
    expect(() => buildPayout([{ wallet: W[0], amount: "$10" }], opts)).toThrow(/isn't a USDC amount/);
  });
  it("enforces the exact total and the spending cap without adjusting anything", () => {
    const rows = [{ wallet: W[0], amount: "70" }, { wallet: W[1], amount: "30.000001" }];
    expect(() => buildPayout(rows, { ...opts, expectedTotal: "100" })).toThrow(/not the expected 100/);
    expect(() => buildPayout([{ wallet: W[0], amount: "1001" }], { ...opts, maxTotal: "1000" })).toThrow(/above the 1000 cap/);
  });
  it("refuses an empty or non-list input", () => {
    expect(() => buildPayout([], opts)).toThrow(/No approved records/);
    expect(() => buildPayout("{{ input.rows }}", opts)).toThrow(/must be a list/);
  });
});

describe("payload fingerprint", () => {
  const base = { tokenMint: mint, destinations: [{ wallet: W[0], amountRaw: "1000000" }, { wallet: W[1], amountRaw: "2000000" }] };
  it("is stable for the same payout and changes with any wallet or amount", () => {
    expect(payoutHash({ ...base, estimate: { fee: 1 } })).toBe(payoutHash(base));
    expect(payoutHash({ ...base, destinations: [{ ...base.destinations[0], amountRaw: "1000001" }, base.destinations[1]] })).not.toBe(payoutHash(base));
    expect(payoutHash({ ...base, destinations: [base.destinations[1], base.destinations[0]] })).not.toBe(payoutHash(base));
    expect(payoutHash({})).toBeNull();
  });
});

describe("weekly schedule", () => {
  it("fires Friday 15:00 wall-clock time across a daylight saving change", () => {
    const cfg = { mode: "weekly", weekday: "5", time: "15:00", timezone: "America/New_York" };
    expect(nextRunAt(cfg, new Date("2026-10-26T12:00:00Z"))?.toISOString()).toBe("2026-10-30T19:00:00.000Z");
    expect(nextRunAt(cfg, new Date("2026-10-31T12:00:00Z"))?.toISOString()).toBe("2026-11-06T20:00:00.000Z");
  });
  it("moves to next week once this week's slot has passed", () => {
    const cfg = { mode: "weekly", weekday: "5", time: "15:00", timezone: "UTC" };
    expect(nextRunAt(cfg, new Date("2026-10-30T15:00:00Z"))?.toISOString()).toBe("2026-11-06T15:00:00.000Z");
  });
  it("has no next run without a valid timezone", () => {
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(nextRunAt({ mode: "weekly", weekday: "5", time: "15:00", timezone: "" }, new Date())).toBeNull();
  });
});

describe("connector helpers", () => {
  it("selects only approved, unpaid rows for the batch, and errors on a missing column", () => {
    const grid = [["name", "wallet", "amount", "batch", "approved", "paid"], ["A", W[0], "1", "W42", "TRUE", ""], ["B", W[1], "1", "W42", "FALSE", ""], ["C", W[2], "1", "W42", "TRUE", "TRUE"], ["D", W[3], "1", "W41", "TRUE", ""]];
    expect(selectRows(grid, { approvedColumn: "approved", paidColumn: "paid", matchColumn: "batch", matchValue: "W42" }).map((r) => r.name)).toEqual(["A"]);
    expect(() => selectRows(grid, { approvedColumn: "ok" })).toThrow(/no "ok" column/);
    expect(() => selectRows(grid, { approvedColumn: "approved", matchColumn: "batch", matchValue: "" })).toThrow(/filter value is empty/);
  });
  it("escapes Airtable formula values so event data can't change the query", () => {
    expect(escapeFormulaString('x", TRUE(), "')).toBe('"x\\", TRUE(), \\""');
    expect(lookupFormula("sku", 'a"b', "status", "approved")).toBe('AND({sku}="a\\"b",{status}="approved")');
  });
  it("normalizes Notion ids and flattens properties", () => {
    expect(normalizeId("0123456789abcdef0123456789abcdef")).toBe("01234567-89ab-cdef-0123-456789abcdef");
    expect(() => normalizeId("not-an-id")).toThrow();
    expect(plainProperties({ Name: { type: "title", title: [{ plain_text: "Policy" }] }, Cap: { type: "number", number: 500 } })).toEqual({ Name: "Policy", Cap: 500 });
  });
});
