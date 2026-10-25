import "server-only";
import { safeFetch, type SafeResponse } from "../engine/safe-fetch";
import { NodeError } from "../engine/types";

// One way to call a provider's REST API: through the SSRF-guarded fetch, with a timeout,
// and errors that name the provider and status but never echo a token or URL with a
// secret in it. Provider error text is trimmed and only kept when it's plain prose.

export interface ProviderCall {
  provider: string;
  method?: string;
  url: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function providerDetail(body: unknown): string {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const nested = o.error && typeof o.error === "object" ? (o.error as Record<string, unknown>) : null;
  const text = [o.message, o.description, o.error_description, nested?.message, typeof o.error === "string" ? o.error : null].find((v) => typeof v === "string");
  if (typeof text !== "string") return "";
  const clean = text.replace(/[A-Za-z0-9_-]{24,}/g, "…").slice(0, 160);
  return ` ${clean}`;
}

export async function callProvider(c: ProviderCall): Promise<SafeResponse> {
  const headers: Record<string, string> = { accept: "application/json", ...c.headers };
  let body: string | undefined;
  if (c.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(c.json);
  } else if (c.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(c.form).toString();
  }
  const res = await safeFetch(c.url, { method: c.method ?? (body ? "POST" : "GET"), headers, body, timeoutMs: c.timeoutMs ?? 10_000, signal: c.signal });
  if (res.status === 401 || res.status === 403) throw new NodeError(`${c.provider} refused the credential (HTTP ${res.status}). Check it's valid and has access.${providerDetail(res.body)}`);
  if (res.status === 404) throw new NodeError(`${c.provider} couldn't find that resource (HTTP 404). Check the ID and that it's shared with your integration.`);
  if (res.status === 429) throw new NodeError(`${c.provider} is rate limiting requests (HTTP 429). Retry in a minute.`);
  if (res.status < 200 || res.status >= 300) throw new NodeError(`${c.provider} answered HTTP ${res.status}.${providerDetail(res.body)}`);
  return res;
}
