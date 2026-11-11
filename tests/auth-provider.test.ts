import { afterEach, describe, expect, it, vi } from "vitest";
import { authProviderFrom } from "@/lib/auth-provider";

describe("auth provider switch", () => {
  it("uses Clerk only when it has a key and local wasn't asked for", () => {
    expect(authProviderFrom(undefined, "pk_test_123")).toBe("clerk");
    expect(authProviderFrom("clerk", "pk_live_123")).toBe("clerk");
    expect(authProviderFrom("local", "pk_test_123")).toBe("local");
    expect(authProviderFrom(undefined, undefined)).toBe("local");
    expect(authProviderFrom(undefined, "")).toBe("local");
  });
});

// Clerk's auth() throws when its middleware didn't run. In local mode the session must never
// call it, or every signed-in request fails.
describe("session in local mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@clerk/nextjs/server");
    vi.doUnmock("next/headers");
  });

  it("never calls Clerk and reads no session without a cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "local");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_123");
    const auth = vi.fn(() => {
      throw new Error("auth() was called but Clerk can't detect usage of clerkMiddleware()");
    });
    vi.doMock("@clerk/nextjs/server", () => ({ auth, currentUser: vi.fn() }));
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

    const session = await import("@/server/auth/session");
    await expect(session.currentUser()).resolves.toBeNull();
    await expect(session.requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(auth).not.toHaveBeenCalled();
  });
});
