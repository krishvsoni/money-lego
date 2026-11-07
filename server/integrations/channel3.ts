import "server-only";
import { env } from "../config/env";
import { AppError, errors } from "../errors";
import { log } from "../log";

// Channel3 product data API (https://channel3.ai/docs). The key stays server-side; the
// browser and the AI model only ever see the normalised product summaries below.

const BASE = "https://api.trychannel3.com";

interface Offer {
  url: string;
  domain: string;
  price: { price: number; compare_at_price?: number | null; currency: string };
  availability: string;
}
interface RawProduct {
  id: string;
  title: string;
  description?: string | null;
  brands?: Array<{ id: string; name: string }>;
  images?: Array<{ url: string; cleaned_url?: string | null; is_main_image?: boolean }>;
  offers?: Offer[];
  ratings?: { value: number; count: number } | null;
  key_features?: string[] | null;
}

export interface ProductSummary {
  id: string;
  title: string;
  brand: string | null;
  image: string | null;
  price: string | null;
  currency: string | null;
  availability: string | null;
  merchant: string | null;
  buyUrl: string | null;
  rating: number | null;
  features: string[];
}

export function channel3Configured(): boolean {
  return Boolean(env().CHANNEL3_API_KEY);
}

// The cheapest in-stock offer is the one shown and the one a checkout would use.
export function summarise(p: RawProduct): ProductSummary {
  const offers = (p.offers ?? []).filter((o) => o?.price && Number.isFinite(o.price.price));
  const best = [...offers].sort((a, b) => Number(b.availability === "InStock") - Number(a.availability === "InStock") || a.price.price - b.price.price)[0];
  const image = p.images?.find((i) => i.is_main_image) ?? p.images?.[0];
  return {
    id: p.id,
    title: String(p.title).slice(0, 200),
    brand: p.brands?.[0]?.name ?? null,
    image: image?.cleaned_url ?? image?.url ?? null,
    price: best ? best.price.price.toFixed(2) : null,
    currency: best?.price.currency ?? null,
    availability: best?.availability ?? null,
    merchant: best?.domain ?? null,
    buyUrl: best?.url ?? null,
    rating: p.ratings?.value ?? null,
    features: (p.key_features ?? []).slice(0, 4).map((f) => String(f).slice(0, 140)),
  };
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = env().CHANNEL3_API_KEY;
  if (!key) throw errors.notConfigured("Channel3 (CHANNEL3_API_KEY)");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: { "x-api-key": key, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw errors.providerUnavailable("Channel3", error);
  }
  if (!res.ok) {
    log.warn("channel3.error", { path, status: res.status });
    const message =
      res.status === 401 ? "Channel3 rejected the API key." : res.status === 402 ? "The Channel3 account is out of credits." : res.status === 422 ? "Channel3 couldn't use that search." : `Channel3 returned HTTP ${res.status}.`;
    throw new AppError(res.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR", 502, message);
  }
  return (await res.json()) as T;
}

export async function searchProducts(input: { query: string; maxPrice?: number | null; limit: number }): Promise<ProductSummary[]> {
  const filters: Record<string, unknown> = { availability: ["InStock"], conditions: ["new"] };
  if (input.maxPrice && input.maxPrice > 0) filters.price = { max_price: input.maxPrice };
  const res = await call<{ products?: RawProduct[] }>("/v1/search", { method: "POST", body: { query: input.query.slice(0, 300), limit: Math.min(30, Math.max(1, input.limit)), filters } });
  return (res.products ?? []).map(summarise);
}

export async function getProduct(id: string): Promise<ProductSummary> {
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) throw errors.validation("That isn't a Channel3 product id.");
  return summarise(await call<RawProduct>(`/v1/products/${encodeURIComponent(id)}`));
}
