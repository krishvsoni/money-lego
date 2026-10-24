import { describe, expect, it } from "vitest";
import { AmountError, formatAmount, fromRaw, splitEvenly, sumRaw, toRaw } from "@/lib/amounts";

describe("toRaw", () => {
  it("converts decimals exactly", () => {
    expect(toRaw("125.5", 6)).toBe(125_500_000n);
    expect(toRaw("0.000001", 6)).toBe(1n);
    expect(toRaw("1,000", 6)).toBe(1_000_000_000n);
  });
  it("never goes through floating point", () => {
    expect(toRaw("0.1", 9) + toRaw("0.2", 9)).toBe(toRaw("0.3", 9));
    expect(toRaw("18446744073709551615", 0)).toBe(18446744073709551615n);
  });
  it("rejects extra precision and junk", () => {
    expect(() => toRaw("1.0000001", 6)).toThrow(AmountError);
    expect(() => toRaw("-1", 6)).toThrow(AmountError);
    expect(() => toRaw("1e5", 6)).toThrow(AmountError);
    expect(() => toRaw("", 6)).toThrow(AmountError);
  });
});

describe("fromRaw / formatAmount", () => {
  it("round-trips", () => {
    expect(fromRaw(125_500_000n, 6)).toBe("125.5");
    expect(fromRaw("1", 6)).toBe("0.000001");
    expect(fromRaw(0n, 6)).toBe("0");
  });
  it("groups thousands", () => {
    expect(formatAmount(1_234_567_890_000n, 6)).toBe("1,234,567.89");
    expect(formatAmount(1_234_567_891_234n, 6, 2)).toBe("1,234,567.89");
  });
});

describe("splitEvenly", () => {
  it("sums exactly to the total even when not divisible", () => {
    const parts = splitEvenly(100n, 3);
    expect(parts).toEqual([34n, 33n, 33n]);
    expect(sumRaw(parts)).toBe(100n);
  });
  it("handles more parts than units", () => {
    const parts = splitEvenly(2n, 5);
    expect(sumRaw(parts)).toBe(2n);
    expect(parts.filter((p) => p === 0n)).toHaveLength(3);
  });
});
