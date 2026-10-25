import { createHash, createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { CONNECTIONS, missingPermissions } from "@/lib/connections/catalog";

process.env.MONGODB_URI ??= "mongodb://localhost:27017";
process.env.APP_URL = "https://money-lego.example";
Object.assign(process.env, {
  GITHUB_CLIENT_ID: "gh-client",
  GITHUB_CLIENT_SECRET: "gh-secret-value",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret-value",
  SLACK_CLIENT_ID: "slack-client",
  SLACK_CLIENT_SECRET: "slack-secret-value",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "discord-secret-value",
  DISCORD_PUBLIC_KEY: "a".repeat(64),
  STRIPE_CLIENT_ID: "ca_test",
  STRIPE_SECRET_KEY: "sk_test_platform",
  STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_platform",
  SHOPIFY_CLIENT_ID: "shopify-client",
  SHOPIFY_CLIENT_SECRET: "shopify-secret-value",
  AIRTABLE_CLIENT_ID: "airtable-client",
  NOTION_CLIENT_ID: "notion-client",
  NOTION_CLIENT_SECRET: "notion-secret-value",
});

let adapters: typeof import("@/server/oauth/adapters");
let state: typeof import("@/server/oauth/state");
let flow: typeof import("@/server/oauth/flow");
let commerce: typeof import("@/server/oauth/adapters/commerce");

beforeAll(async () => {
  (await import("@/server/config/env")).resetEnvForTests();
  adapters = await import("@/server/oauth/adapters");
  state = await import("@/server/oauth/state");
  flow = await import("@/server/oauth/flow");
  commerce = await import("@/server/oauth/adapters/commerce");
});

const SECRETS = ["gh-secret-value", "google-secret-value", "slack-secret-value", "discord-secret-value", "sk_test_platform", "shopify-secret-value", "notion-secret-value"];

describe("sign-in URLs", () => {
  it.each(CONNECTIONS.filter((c) => c.method === "oauth").map((c) => [c.slug, c] as const))("%s asks for exactly its catalog scopes and leaks no secret", (_slug, c) => {
    const a = adapters.adapterFor(c.type)!;
    expect(a.configured()).toBe(true);
    const url = a.authorizeUrl({ state: "s".repeat(43), redirectUri: flow.redirectUriFor(c.slug), challenge: "c".repeat(43), shop: "demo-store.myshopify.com" });
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.searchParams.get("state")).toBe("s".repeat(43));
    expect(parsed.searchParams.get("redirect_uri")).toBe(`https://money-lego.example/api/connections/${c.slug}/callback`);
    const scope = parsed.searchParams.get("scope") ?? "";
    for (const p of c.permissions.filter((p) => !["pages", "email"].includes(p.scope))) expect(scope).toContain(p.scope);
    for (const s of SECRETS) expect(url).not.toContain(s);
  });

  it("uses PKCE where the provider supports it", () => {
    for (const type of ["github_account", "google_account", "airtable_account"]) {
      const url = new URL(adapters.adapterFor(type)!.authorizeUrl({ state: "s".repeat(43), redirectUri: "https://x/cb", challenge: "c".repeat(43) }));
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    }
  });

  it("refuses a Shopify store that isn't a myshopify.com domain", () => {
    expect(() => adapters.adapterFor("shopify_store")!.authorizeUrl({ state: "s", redirectUri: "https://x/cb", challenge: "c", shop: "evil.com" })).toThrow();
  });
});

describe("OAuth safety helpers", () => {
  it("derives the PKCE challenge as base64url SHA-256 of the verifier", () => {
    const { verifier, challenge } = state.pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("only returns to same-site paths after sign-in", () => {
    expect(flow.safeReturnTo("/workflows/abc?setup=1")).toBe("/workflows/abc?setup=1");
    for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/\\evil", null]) expect(flow.safeReturnTo(bad)).toBe("/connections");
  });

  it("verifies Shopify's signed redirect", () => {
    const params = new URLSearchParams({ code: "abc", shop: "demo-store.myshopify.com", state: "xyz", timestamp: "1700000000" });
    const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
    params.set("hmac", createHmac("sha256", "shopify-secret-value").update(message).digest("hex"));
    expect(commerce.shopifyQueryValid(params, "shopify-secret-value")).toBe(true);
    params.set("shop", "other-store.myshopify.com");
    expect(commerce.shopifyQueryValid(params, "shopify-secret-value")).toBe(false);
  });

  it("flags a connection missing a required permission", () => {
    expect(missingPermissions("google_account", ["email"])).toEqual(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
    expect(missingPermissions("google_account", ["email", "https://www.googleapis.com/auth/spreadsheets.readonly"])).toEqual([]);
  });
});
