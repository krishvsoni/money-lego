import "server-only";
import { providerCredentials } from "../config/env";
import { log } from "../log";

// The only code that talks HTTP to MultiHopper. Callers get one of two failure kinds:
// ProviderRejected means MultiHopper answered and said no, so nothing happened. Anything
// else (timeout, reset, 5xx) is ProviderAmbiguous: the request may or may not have taken
// effect, and the caller must look the result up before trying again.

const TIMEOUT_MS = 15_000;

export class ProviderRejected extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderRejected";
  }
}

export class ProviderAmbiguous extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ProviderAmbiguous";
  }
}

// Per-instance circuit breaker. After repeated transport failures we stop calling for a
// cool-down period and fail fast, instead of stacking up 15-second timeouts.
const breaker = { failures: 0, openUntil: 0 };
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

function recordOutcome(ok: boolean) {
  if (ok) {
    breaker.failures = 0;
    return;
  }
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    log.warn("multihopper.breaker_open", { cooldownMs: BREAKER_COOLDOWN_MS });
  }
}

interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function once(method: "GET" | "POST", path: string, opts: RequestOptions): Promise<unknown> {
  if (Date.now() < breaker.openUntil) throw new ProviderAmbiguous("Circuit open; provider recently unreachable");
  const { baseUrl, apiKey } = providerCredentials();
  const headers: Record<string, string> = { "x-api-key": apiKey, accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    recordOutcome(false);
    throw new ProviderAmbiguous(`Network error calling ${method} ${path}`, error);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (res.ok) {
    recordOutcome(true);
    return json;
  }
  if (res.status >= 500) {
    recordOutcome(false);
    throw new ProviderAmbiguous(`MultiHopper ${res.status} on ${method} ${path}`);
  }
  recordOutcome(true);
  const envelope = (json as { error?: { code?: string; message?: string } } | null)?.error;
  const retryAfter = Number(res.headers.get("retry-after")) || undefined;
  throw new ProviderRejected(res.status, envelope?.code ?? `HTTP_${res.status}`, envelope?.message ?? res.statusText, retryAfter);
}

// GETs are safe to retry. POSTs are retried only when the caller passes `retries` and an
// idempotency key, which makes a repeat land on the same server-side result.
export async function providerRequest(method: "GET" | "POST", path: string, opts: RequestOptions = {}): Promise<unknown> {
  const retries = method === "GET" ? (opts.retries ?? 2) : opts.idempotencyKey ? (opts.retries ?? 0) : 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(method, path, opts);
    } catch (error) {
      const transient =
        error instanceof ProviderAmbiguous ||
        (error instanceof ProviderRejected && (error.status === 429 || error.code === "MH_072"));
      if (!transient || attempt >= retries) throw error;
      const backoff = Math.min(4_000, 300 * 2 ** attempt) + Math.floor(Math.random() * 250);
      const wait = error instanceof ProviderRejected && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : backoff;
      log.warn("multihopper.retry", { method, path, attempt: attempt + 1, waitMs: wait });
      await sleep(Math.min(wait, 5_000));
    }
  }
}
