import "server-only";
import { safeFetch } from "../engine/safe-fetch";
import { OAuthError } from "./types";

// Calls to providers' OAuth and API endpoints. Errors name the provider and never echo
// tokens, codes or secrets; the provider's own error code is kept when it's a short word.

export interface OAuthRequest {
  provider: string;
  url: string;
  method?: string;
  form?: Record<string, string>;
  json?: unknown;
  bearer?: string;
  basic?: { user: string; password: string };
  headers?: Record<string, string>;
}

export async function oauthRequest<T = Record<string, unknown>>(r: OAuthRequest): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", ...r.headers };
  if (r.bearer) headers.authorization = `Bearer ${r.bearer}`;
  if (r.basic) headers.authorization = `Basic ${Buffer.from(`${r.basic.user}:${r.basic.password}`).toString("base64")}`;
  let body: string | undefined;
  if (r.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(r.form).toString();
  } else if (r.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(r.json);
  }
  let res: Awaited<ReturnType<typeof safeFetch>>;
  try {
    res = await safeFetch(r.url, { method: r.method ?? (body ? "POST" : "GET"), headers, body, timeoutMs: 10_000 });
  } catch {
    throw new OAuthError(`${r.provider} didn't answer. Try again in a minute.`);
  }
  const data = (res.body && typeof res.body === "object" ? res.body : {}) as Record<string, unknown>;
  const code = typeof data.error === "string" && /^[a-z_]{3,40}$/.test(data.error) ? data.error : null;
  if (res.status >= 400 || data.ok === false) {
    const reconnect = res.status === 401 || code === "invalid_grant" || code === "invalid_token" || code === "token_revoked";
    throw new OAuthError(`${r.provider} refused the request (HTTP ${res.status}${code ? `, ${code}` : ""}).`, reconnect);
  }
  return data as T;
}

export const expiresAt = (expiresIn: unknown) => (typeof expiresIn === "number" && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined);
export const scopeList = (value: unknown, sep = " ") => (typeof value === "string" ? value.split(sep).map((s) => s.trim()).filter(Boolean) : []);
