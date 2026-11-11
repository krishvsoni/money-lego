import { describe, expect, it } from "vitest";
import { shouldBypassClerkProxy } from "@/proxy";

describe("proxy Clerk bypass", () => {
  it("bypasses Clerk on production when a test key is configured", () => {
    expect(shouldBypassClerkProxy("pk_test_123", "production")).toBe(true);
  });

  it("keeps Clerk enabled for production live keys", () => {
    expect(shouldBypassClerkProxy("pk_live_123", "production")).toBe(false);
  });

  it("keeps Clerk enabled outside production", () => {
    expect(shouldBypassClerkProxy("pk_test_123", "development")).toBe(false);
    expect(shouldBypassClerkProxy("pk_test_123", "test")).toBe(false);
  });
});
