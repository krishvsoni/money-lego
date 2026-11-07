import "server-only";
import { paypalCredentials } from "../config/env";
import { AppError, errors } from "../errors";
import { log } from "../log";

// The only code that holds PayPal credentials. Every other module calls paypalRequest(),
// which adds a cached OAuth 2.0 client-credentials token, an idempotency key for writes
// (PayPal-Request-Id) and turns PayPal's error bodies into plain messages. Tokens and
// secrets never leave this file: not in logs, not in responses, not in run data.

const TIMEOUT_MS = 20_000;

interface CachedToken {
  value: string;
  scopes: string[];
  appId: string | null;
  expiresAt: number;
}

let token: CachedToken | null = null;
let inflight: Promise<CachedToken> | null = null;

export class PaypalError extends AppError {
  constructor(
    readonly httpStatus: number,
    readonly paypalName: string,
    readonly issue: string | null,
    readonly debugId: string | null,
    message: string,
  ) {
    super(httpStatus >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR", httpStatus >= 500 ? 503 : 502, message);
    this.name = "PaypalError";
  }
}

// Plain-language messages for the PayPal errors an operator can act on.
function explain(status: number, name: string, issue: string | null, description: string | null): string {
  const tail = description ? ` (${description.slice(0, 200)})` : "";
  if (status === 401) return "PayPal rejected the app credentials. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.";
  if (status === 403 || name === "NOT_AUTHORIZED" || name === "PERMISSION_DENIED" || name === "AUTHORIZATION_ERROR") {
    return `This PayPal app isn't allowed to do that yet${tail}. Enable the feature on the app in the PayPal Developer Dashboard, or ask PayPal to grant it for sandbox.`;
  }
  if (status === 404 || name === "RESOURCE_NOT_FOUND" || issue === "INVALID_RESOURCE_ID") return `PayPal couldn't find that object${tail}.`;
  if (issue === "INSUFFICIENT_FUNDS" || name === "INSUFFICIENT_FUNDS") return "The PayPal account doesn't have enough balance for this. Nothing was sent.";
  if (issue === "ORDER_NOT_APPROVED") return "The buyer hasn't approved this order yet.";
  if (issue === "ORDER_ALREADY_CAPTURED" || issue === "DUPLICATE_INVOICE_ID") return `PayPal says this was already done${tail}.`;
  if (name === "USER_BUSINESS_ERROR" && issue === "DUPLICATE_REQUEST_ID") return "PayPal already received this exact request.";
  if (status === 422) return `PayPal declined the request: ${issue ?? name}${tail}.`;
  if (status === 429) return "PayPal is rate limiting this app. Try again in a minute.";
  if (status >= 500) return "PayPal is having trouble right now. Nothing was changed; try again shortly.";
  return `PayPal returned ${issue ?? name}${tail}.`;
}

async function fetchToken(): Promise<CachedToken> {
  const { baseUrl, clientId, clientSecret } = paypalCredentials();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    log.warn("paypal.token_network", { error: error instanceof Error ? error.name : "unknown" });
    throw errors.providerUnavailable("PayPal", error);
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; app_id?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    log.warn("paypal.token_failed", { status: res.status, error: body.error });
    throw new PaypalError(res.status, body.error ?? "TOKEN_FAILED", null, res.headers.get("paypal-debug-id"), explain(res.status === 400 ? 401 : res.status, body.error ?? "", null, null));
  }
  return {
    value: body.access_token,
    scopes: String(body.scope ?? "").split(" ").filter(Boolean),
    appId: body.app_id ?? null,
    // Refresh a minute early so a token never expires mid-request.
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in ?? 0) - 60) * 1000,
  };
}

export async function accessToken(force = false): Promise<CachedToken> {
  if (!force && token && token.expiresAt > Date.now()) return token;
  inflight ??= fetchToken().finally(() => {
    inflight = null;
  });
  token = await inflight;
  return token;
}

export function forgetToken(): void {
  token = null;
}

export interface PaypalRequest {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  // Raw JSON text, used when the exact bytes matter (webhook verification).
  rawBody?: string;
  // Idempotency key for writes. PayPal returns the first result for a repeated key.
  requestId?: string;
  prefer?: "return=representation" | "return=minimal";
}

export async function paypalRequest<T>(req: PaypalRequest, retried = false): Promise<T> {
  const { baseUrl } = paypalCredentials();
  const auth = await accessToken();
  const url = new URL(req.path, baseUrl);
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const method = req.method ?? (req.body === undefined && req.rawBody === undefined ? "GET" : "POST");

  const headers: Record<string, string> = { authorization: `Bearer ${auth.value}`, accept: "application/json" };
  if (req.body !== undefined || req.rawBody !== undefined) headers["content-type"] = "application/json";
  if (req.requestId) headers["paypal-request-id"] = req.requestId.slice(0, 108);
  if (req.prefer) headers.prefer = req.prefer;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: req.rawBody ?? (req.body === undefined ? undefined : JSON.stringify(req.body)),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    log.warn("paypal.network", { path: req.path, error: error instanceof Error ? error.name : "unknown" });
    throw errors.providerUnavailable("PayPal", error);
  }

  // A token revoked early (credential rotation) gets one fresh attempt.
  if (res.status === 401 && !retried) {
    forgetToken();
    return paypalRequest<T>(req, true);
  }
  if (res.status === 204) return {} as T;
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  if (res.ok) return json as T;

  const details = Array.isArray(json.details) ? (json.details as Array<{ issue?: string; description?: string }>) : [];
  const name = String(json.name ?? json.error ?? "PAYPAL_ERROR");
  const issue = details[0]?.issue ?? null;
  const debugId = String(json.debug_id ?? res.headers.get("paypal-debug-id") ?? "") || null;
  log.warn("paypal.error", { path: req.path, status: res.status, name, issue, debugId });
  throw new PaypalError(res.status, name, issue, debugId, explain(res.status, name, issue, details[0]?.description ?? (typeof json.message === "string" ? json.message : null)));
}

// What the configured app may do, read from the scopes PayPal granted to its token. Used
// to show capabilities honestly instead of assuming them.
export async function paypalCapabilities(): Promise<{ appId: string | null; scopes: string[]; features: Record<string, boolean> }> {
  const t = await accessToken();
  const has = (fragment: string) => t.scopes.some((s) => s.includes(fragment));
  return {
    appId: t.appId,
    scopes: t.scopes,
    features: {
      checkout: has("/payments/") || has("checkout") || has("/v2/checkout"),
      payouts: has("payouts"),
      invoicing: has("invoicing"),
      subscriptions: has("billing") || has("subscription"),
      reporting: has("reporting"),
      disputes: has("disputes"),
      vault: has("vault"),
    },
  };
}
