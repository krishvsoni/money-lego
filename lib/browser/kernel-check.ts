import { assertFinalUrl, parseTarget } from "./url-policy";

// The read-only "browser check": open one fresh Kernel browser, load a page, read its title
// and schema.org Product offers, and always delete the browser. Shared by the PoC script and
// the eventual `browser.check` executor, so both enforce the same URL and redirect rules.
// Plain REST on purpose: no Kernel SDK is added until Kernel is adopted.

export interface KernelClient {
  createBrowser(): Promise<{ sessionId: string }>;
  execute(sessionId: string, code: string): Promise<{ success: boolean; result?: unknown; error?: string; stderr?: string }>;
  deleteBrowser(sessionId: string): Promise<void>;
}

export interface Offer {
  name: string | null;
  price: unknown;
  currency: string | null;
  availability: string | null;
}

export interface PageCheck {
  session: string;
  finalUrl: string;
  title: string;
  offers: Offer[];
  ms: { createBrowser: number; loadAndRead: number; total: number };
}

// Fixed code; the URL goes in as JSON data, so nothing a workflow supplies is ever run as code.
export const readPageScript = (url: string) => `
await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded", timeout: 20000 });
const offers = [];
for (const el of await page.locator('script[type="application/ld+json"]').all()) {
  try {
    const items = [JSON.parse(await el.textContent())].flat().flatMap((d) => d["@graph"] ?? [d]);
    for (const item of items) {
      if (![item["@type"]].flat().includes("Product")) continue;
      for (const o of [item.offers ?? []].flat()) offers.push({ name: item.name ?? null, price: o.price ?? o.lowPrice ?? null, currency: o.priceCurrency ?? null, availability: o.availability ?? null });
    }
  } catch {}
}
return { finalUrl: page.url(), title: (await page.title()).slice(0, 200), offers: offers.slice(0, 5) };
`;

export interface CheckOptions {
  url: string;
  allowedHost?: string | null;
  client: KernelClient;
  // Where a failed browser delete is reported; the check itself still succeeds or fails on its own.
  onCleanupError?: (sessionId: string, error: unknown) => void;
  now?: () => number;
}

export async function checkPage({ url, allowedHost, client, onCleanupError, now = Date.now }: CheckOptions): Promise<PageCheck> {
  // Validated before a browser exists, so a bad URL costs nothing.
  const target = parseTarget(url, allowedHost);
  const started = now();
  const { sessionId } = await client.createBrowser();
  const created = now();
  try {
    const run = await client.execute(sessionId, readPageScript(target.url.href));
    const finished = now();
    if (!run.success) throw new Error(`Page script failed: ${run.error ?? run.stderr ?? "unknown error"}`);
    const result = (run.result ?? {}) as { finalUrl?: unknown; title?: unknown; offers?: unknown };
    // A page that redirects to another host isn't the page that was asked for: fail, and
    // return none of its data.
    const final = assertFinalUrl(result.finalUrl, target);
    return {
      session: sessionId,
      finalUrl: final.href,
      title: typeof result.title === "string" ? result.title.slice(0, 200) : "",
      offers: Array.isArray(result.offers) ? (result.offers as Offer[]).slice(0, 5) : [],
      ms: { createBrowser: created - started, loadAndRead: finished - created, total: finished - started },
    };
  } finally {
    await client.deleteBrowser(sessionId).catch((error) => onCleanupError?.(sessionId, error));
  }
}

// The Kernel REST API as a KernelClient.
export function kernelRestClient({ apiKey, baseUrl = "https://api.onkernel.com", fetchImpl = fetch }: { apiKey: string; baseUrl?: string; fetchImpl?: typeof fetch }): KernelClient {
  const api = baseUrl.replace(/\/$/, "");
  async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
    const res = await fetchImpl(`${api}${path}`, {
      method,
      headers: { authorization: `Bearer ${apiKey}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Kernel ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : null) as T;
  }
  return {
    async createBrowser() {
      // A short timeout means Kernel removes the browser itself even if this process dies.
      const b = await call<{ session_id: string }>("POST", "/browsers", { headless: true, stealth: true, timeout_seconds: 60, tags: { app: "money-lego", purpose: "page-check" } });
      return { sessionId: b.session_id };
    },
    execute: (sessionId, code) => call("POST", `/browsers/${encodeURIComponent(sessionId)}/playwright/execute`, { code, timeout_sec: 30 }, 40_000),
    async deleteBrowser(sessionId) {
      await call("DELETE", `/browsers/${encodeURIComponent(sessionId)}`);
    },
  };
}
