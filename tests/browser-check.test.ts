import { describe, expect, it, vi } from "vitest";
import { checkPage, kernelRestClient, type KernelClient } from "@/lib/browser/kernel-check";
import { assertFinalUrl, normalizeHost, parseTarget, UrlPolicyError } from "@/lib/browser/url-policy";

// A fake Kernel that reports the page ended up at `finalUrl`, and records what was called.
function fakeKernel(finalUrl: unknown, overrides: Partial<KernelClient> = {}) {
  const calls: string[] = [];
  const client: KernelClient = {
    createBrowser: vi.fn(async () => {
      calls.push("create");
      return { sessionId: "sess-1" };
    }),
    execute: vi.fn(async () => {
      calls.push("execute");
      return { success: true, result: { finalUrl, title: "Desk lamp", offers: [{ name: "Lamp", price: "19.99", currency: "USD", availability: "InStock" }] } };
    }),
    deleteBrowser: vi.fn(async () => {
      calls.push("delete");
    }),
    ...overrides,
  };
  return { client, calls };
}

describe("normalizeHost", () => {
  it("lowercases, strips trailing dots and punycodes IDNs", () => {
    expect(normalizeHost(" Shop.Example.COM ")).toBe("shop.example.com");
    expect(normalizeHost("shop.example.com.")).toBe("shop.example.com");
    expect(normalizeHost("bücher.example")).toBe("xn--bcher-kva.example");
  });

  it("rejects anything that isn't a bare host", () => {
    for (const bad of ["", "  ", "example.com:8443", "example.com/path", "user@example.com", "https://example.com", "exa mple.com"]) {
      expect(() => normalizeHost(bad), bad).toThrow(UrlPolicyError);
    }
  });
});

describe("parseTarget", () => {
  it("accepts https and compares hosts after normalizing both sides", () => {
    expect(parseTarget("https://SHOP.example.com./p/1", "shop.example.com").host).toBe("shop.example.com");
    expect(parseTarget("https://shop.example.com/p/1", "SHOP.EXAMPLE.COM.").host).toBe("shop.example.com");
    expect(parseTarget("https://xn--bcher-kva.example/", "bücher.example").host).toBe("xn--bcher-kva.example");
  });

  it("rejects invalid schemes and credentials", () => {
    for (const bad of ["http://shop.example.com/", "javascript:alert(1)", "file:///etc/passwd", "data:text/html,hi", "ftp://shop.example.com/", "not a url", "https://user:pw@shop.example.com/"]) {
      expect(() => parseTarget(bad), bad).toThrow(UrlPolicyError);
    }
  });

  it("rejects a host other than the allowed one, including look-alike suffixes", () => {
    expect(() => parseTarget("https://evil.com/", "shop.example.com")).toThrow(/not the allowed host/);
    expect(() => parseTarget("https://shop.example.com.evil.com/", "shop.example.com")).toThrow(UrlPolicyError);
    expect(() => parseTarget("https://evilshop.example.com/", "shop.example.com")).toThrow(UrlPolicyError);
  });
});

describe("assertFinalUrl", () => {
  const target = parseTarget("https://shop.example.com/p/1");

  it("allows a redirect within the same host", () => {
    expect(assertFinalUrl("https://shop.example.com/p/1?ref=x", target).pathname).toBe("/p/1");
    expect(assertFinalUrl("https://SHOP.example.com./other", target).hostname).toBe("shop.example.com.");
  });

  it("rejects another host, a subdomain, an http downgrade or a missing URL", () => {
    for (const bad of ["https://evil.com/", "https://www.shop.example.com/", "http://shop.example.com/p/1", "about:blank", "", null, undefined, 42]) {
      expect(() => assertFinalUrl(bad, target), String(bad)).toThrow(UrlPolicyError);
    }
  });
});

describe("checkPage", () => {
  it("returns the page data after a same-host redirect and deletes the browser", async () => {
    const { client, calls } = fakeKernel("https://shop.example.com/p/1-desk-lamp");
    const r = await checkPage({ url: "https://shop.example.com/p/1", allowedHost: "shop.example.com", client });
    expect(r).toMatchObject({ session: "sess-1", finalUrl: "https://shop.example.com/p/1-desk-lamp", title: "Desk lamp" });
    expect(r.offers).toHaveLength(1);
    expect(calls).toEqual(["create", "execute", "delete"]);
  });

  it("fails on a cross-host redirect, returns no page data, and still deletes the browser", async () => {
    const { client, calls } = fakeKernel("https://phishing.example.net/lamp");
    await expect(checkPage({ url: "https://shop.example.com/p/1", allowedHost: "shop.example.com", client })).rejects.toThrow(/redirected to phishing\.example\.net/);
    expect(calls).toEqual(["create", "execute", "delete"]);
  });

  it("fails on a cross-host redirect even without an allowed host", async () => {
    const { client } = fakeKernel("https://other.example.org/");
    await expect(checkPage({ url: "https://shop.example.com/p/1", client })).rejects.toThrow(UrlPolicyError);
  });

  it("never creates a browser for an invalid URL or wrong host", async () => {
    const { client, calls } = fakeKernel("https://shop.example.com/");
    await expect(checkPage({ url: "http://shop.example.com/", client })).rejects.toThrow(/https/);
    await expect(checkPage({ url: "https://evil.com/", allowedHost: "shop.example.com", client })).rejects.toThrow(/allowed host/);
    expect(calls).toEqual([]);
  });

  it("deletes the browser when the page script fails or execution throws", async () => {
    const failed = fakeKernel("", { execute: vi.fn(async () => ({ success: false, error: "Timeout 20000ms exceeded" })) });
    await expect(checkPage({ url: "https://shop.example.com/", client: failed.client })).rejects.toThrow(/Timeout/);
    expect(failed.client.deleteBrowser).toHaveBeenCalledWith("sess-1");

    const threw = fakeKernel("", { execute: vi.fn(async () => Promise.reject(new Error("Kernel 502"))) });
    await expect(checkPage({ url: "https://shop.example.com/", client: threw.client })).rejects.toThrow("Kernel 502");
    expect(threw.client.deleteBrowser).toHaveBeenCalledWith("sess-1");
  });

  it("reports a failed delete without hiding the check's own error", async () => {
    const onCleanupError = vi.fn();
    const { client } = fakeKernel("https://evil.com/", { deleteBrowser: vi.fn(async () => Promise.reject(new Error("delete failed"))) });
    await expect(checkPage({ url: "https://shop.example.com/", client, onCleanupError })).rejects.toThrow(UrlPolicyError);
    expect(onCleanupError).toHaveBeenCalledWith("sess-1", expect.any(Error));
  });
});

describe("kernelRestClient", () => {
  it("sends the key, and deletes by session id", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 })) as unknown as typeof fetch;
    await kernelRestClient({ apiKey: "k", baseUrl: "https://kernel.test/", fetchImpl }).deleteBrowser("a/b");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://kernel.test/browsers/a%2Fb");
    expect(init).toMatchObject({ method: "DELETE", headers: { authorization: "Bearer k" } });
  });

  it("throws on a non-2xx answer", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(kernelRestClient({ apiKey: "k", fetchImpl }).createBrowser()).rejects.toThrow(/401/);
  });
});
