import { describe, expect, it } from "vitest";
import { listOf, reclaimBundleSchema, rescueBundleSchema, transferSchema, webhookEndpointSchema } from "@/server/multihopper/schemas";

const transfer = { id: 42, amountRaw: "1000", status: "failed" };

describe("MultiHopper recovery parsing", () => {
  it("defaults a missing recovery block to null", () => {
    expect(transferSchema.parse(transfer).recovery).toBeNull();
  });

  it("fills recovery flags the provider leaves out", () => {
    const parsed = transferSchema.parse({ ...transfer, recovery: { canRescue: true, rescuableLamports: 5000 } });
    expect(parsed.recovery).toMatchObject({ canRescue: true, rescuableLamports: 5000, canReclaimRent: false, reclaimableLamports: 0 });
  });

  it("accepts rescue transactions as objects or bare base64", () => {
    const bundle = rescueBundleSchema.parse({ rescueTxs: [{ base64: "AA==", partialSigners: ["x"] }, "AQ=="], lastValidBlockHeight: 9 });
    expect(bundle.rescueTxs).toEqual(["AA==", "AQ=="]);
  });

  it("reads the reclaim summary", () => {
    const bundle = reclaimBundleSchema.parse({ reclaimTxs: ["AA=="], reclaimable: { totalLamports: 2039280, stepCount: 3 } });
    expect(bundle.reclaimable?.totalLamports).toBe(2039280);
    expect(bundle.lastValidBlockHeight).toBeNull();
  });
});

describe("MultiHopper list envelopes", () => {
  it("unwraps { items } and bare arrays alike", () => {
    const endpoint = { id: 1, url: "https://example.com/hook" };
    const list = listOf(webhookEndpointSchema);
    expect(list.parse({ items: [endpoint] })).toHaveLength(1);
    expect(list.parse([endpoint])[0].events).toEqual([]);
  });
});
