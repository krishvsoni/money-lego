import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/lib/site-url";

describe("resolveSiteUrl", () => {
  it("uses a real public APP_URL as is, without a trailing slash", () => {
    expect(resolveSiteUrl({ APP_URL: "https://money-lego.example.com/", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "money-lego.vercel.app" })).toBe("https://money-lego.example.com");
  });

  it("on Vercel production, replaces a localhost or missing APP_URL with the project's domain", () => {
    const vercel = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "money-lego.vercel.app", VERCEL_URL: "money-lego-abc123.vercel.app" };
    expect(resolveSiteUrl({ ...vercel, APP_URL: "http://localhost:3000" })).toBe("https://money-lego.vercel.app");
    expect(resolveSiteUrl({ ...vercel, APP_URL: "http://127.0.0.1:3000" })).toBe("https://money-lego.vercel.app");
    expect(resolveSiteUrl(vercel)).toBe("https://money-lego.vercel.app");
  });

  it("on a Vercel preview, uses that deployment's own address", () => {
    expect(resolveSiteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "money-lego-git-feat.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "money-lego.vercel.app" })).toBe("https://money-lego-git-feat.vercel.app");
  });

  it("locally, keeps localhost", () => {
    expect(resolveSiteUrl({ APP_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(resolveSiteUrl({ PORT: "4000" })).toBe("http://localhost:4000");
  });
});
