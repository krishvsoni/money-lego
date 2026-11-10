import { describe, expect, it } from "vitest";
import { isTestTrigger } from "@/lib/workflow/test-mode";

describe("test mode", () => {
  it("treats a trigger's test payload as a test run", () => {
    expect(isTestTrigger({ source: "test", captureId: "TEST-CAPTURE", amount: "100.00" })).toBe(true);
  });

  it("treats real trigger data as real", () => {
    expect(isTestTrigger({ source: "paypal", captureId: "9NC91644W4323815D" })).toBe(false);
    expect(isTestTrigger({ request: "A quiet keyboard", maxPrice: "150" })).toBe(false);
    expect(isTestTrigger({ body: { source: "test" } })).toBe(false);
  });

  it("is false for anything that isn't an object", () => {
    for (const v of [null, undefined, "test", 0, []]) expect(isTestTrigger(v)).toBe(false);
  });
});
