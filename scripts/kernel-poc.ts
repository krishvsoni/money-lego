// Kernel proof of concept: the read-only "browser check" a workflow step would do.
//
//   npm run kernel:poc -- https://www.example-store.com/some-product [allowed-host]
//
// Opens one fresh headless Kernel browser, loads the page, reads the title and any
// schema.org Product price/availability, and always deletes the browser. The Playwright code
// runs inside Kernel's VM (Playwright Execution), so this app ships no browser or Playwright.
// Plain REST on purpose: no dependency is added until Kernel is adopted. Needs KERNEL_API_KEY.

const API = (process.env.KERNEL_BASE_URL ?? "https://api.onkernel.com").replace(/\/$/, "");
const KEY = process.env.KERNEL_API_KEY;

interface KernelBrowser {
  session_id: string;
  browser_live_view_url?: string;
}

interface ExecuteResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  stderr?: string;
}

async function kernel<T>(method: string, path: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kernel ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

// Fixed code; the URL goes in as JSON data, so nothing a workflow supplies is ever run as code.
const readPage = (url: string) => `
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

function parseTarget(raw: string | undefined, allowedHost: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    throw new Error("Pass an https:// URL, e.g. npm run kernel:poc -- https://example.com");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// URLs are allowed.");
  if (allowedHost && url.hostname !== allowedHost) throw new Error(`URL host ${url.hostname} is not ${allowedHost}.`);
  return url;
}

async function main() {
  const [rawUrl, allowedHost] = process.argv.slice(2);
  const target = parseTarget(rawUrl, allowedHost);
  if (!KEY) throw new Error("KERNEL_API_KEY is not set. Create a project-scoped key in the Kernel dashboard (browsers: create, use, delete) and add it to .env.");

  const started = Date.now();
  // A short timeout means Kernel removes the browser itself even if this process dies.
  const browser = await kernel<KernelBrowser>("POST", "/browsers", { headless: true, stealth: true, timeout_seconds: 60, tags: { app: "money-lego", purpose: "poc" } });
  const created = Date.now();
  try {
    const run = await kernel<ExecuteResponse>("POST", `/browsers/${browser.session_id}/playwright/execute`, { code: readPage(target.href), timeout_sec: 30 }, 40_000);
    const finished = Date.now();
    if (!run.success) throw new Error(`Page script failed: ${run.error ?? run.stderr ?? "unknown error"}`);
    const result = run.result as { finalUrl: string };
    // A page that redirects elsewhere doesn't count as the page that was asked for.
    const finalHost = new URL(result.finalUrl).hostname;
    const expected = allowedHost ?? target.hostname;
    console.log(
      JSON.stringify(
        {
          session: browser.session_id,
          ms: { createBrowser: created - started, loadAndRead: finished - created, total: finished - started },
          hostCheck: finalHost === expected ? "ok" : `redirected to ${finalHost}`,
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await kernel("DELETE", `/browsers/${browser.session_id}`).catch((e) => console.error(`Could not delete browser ${browser.session_id}: ${e.message}`));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
