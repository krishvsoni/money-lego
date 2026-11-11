import "server-only";
import { connectionBySlug } from "@/lib/connections/catalog";
import type { ConnectionType } from "@/lib/nodes/types";
import type { SessionUser } from "../auth/session";
import { appUrl } from "../config/env";
import { errors } from "../errors";
import { log } from "../log";
import { adapterFor } from "./adapters";
import { SHOP_DOMAIN } from "./adapters/commerce";
import { consumeState, createState, pkcePair } from "./state";
import { saveConnection } from "./store";
import { OAuthError } from "./types";

// The two halves of "Sign in with <provider>". Start records who asked (bound to their
// session), then sends them to the provider's consent screen. The callback accepts the
// result only from that same signed-in user, exchanges the one-time code server-side and
// saves the connection. Codes, tokens and verifiers never reach the browser.

export const redirectUriFor = (slug: string) => `${appUrl()}/api/connections/${slug}/callback`;

// Only same-site paths, so the callback can't be turned into an open redirect.
export function safeReturnTo(value: string | null): string {
  return value && /^\/(?!\/)[A-Za-z0-9/_?=&.%-]{0,200}$/.test(value) ? value : "/connections";
}

export async function startConnection(user: SessionUser, slug: string, opts: { returnTo: string | null; popup: boolean; shop: string | null }): Promise<string> {
  const info = connectionBySlug(slug);
  const adapter = info && adapterFor(info.type);
  if (!info || !adapter) throw errors.notFound("Connection");
  if (!adapter.configured()) throw errors.notConfigured(`${info.label} sign-in`);
  const shop = opts.shop?.trim().toLowerCase() ?? undefined;
  if (info.asks === "shop" && (!shop || !SHOP_DOMAIN.test(shop))) throw errors.validation("Enter your store as your-store.myshopify.com.");
  const { verifier, challenge } = pkcePair();
  const state = await createState({ userId: user.userId, type: info.type, verifier, returnTo: safeReturnTo(opts.returnTo), popup: opts.popup, shop });
  try {
    return adapter.authorizeUrl({ state, redirectUri: redirectUriFor(slug), challenge, shop });
  } catch (error) {
    if (error instanceof OAuthError) throw errors.validation(error.message);
    throw error;
  }
}

export interface CallbackResult {
  ok: boolean;
  message: string;
  returnTo: string;
  popup: boolean;
  type: string;
}

export async function completeConnection(user: SessionUser | null, slug: string, query: URLSearchParams): Promise<CallbackResult> {
  const info = connectionBySlug(slug);
  const fail = (message: string, pending?: { returnTo: string; popup: boolean }): CallbackResult => ({ ok: false, message, returnTo: pending?.returnTo ?? "/connections", popup: pending?.popup ?? false, type: info?.type ?? "" });
  if (!info) return fail("Unknown connection.");

  const pending = await consumeState(query.get("state") ?? "");
  if (!pending || pending.type !== info.type) return fail("This sign-in link expired or was already used. Start again.");
  if (!user || !user.userId.equals(pending.userId)) return fail("Sign in to Money Lego with the same account that started this connection.", pending);
  const providerError = query.get("error");
  if (providerError) return fail(providerError === "access_denied" ? "You cancelled on the provider's screen. Nothing was connected." : `${info.label} returned an error.`, pending);
  const code = query.get("code");
  if (!code || code.length > 2048) return fail(`${info.label} didn't return a sign-in code.`, pending);

  const adapter = adapterFor(info.type)!;
  try {
    const grant = await adapter.exchange({ code, redirectUri: redirectUriFor(slug), verifier: pending.verifier, query, shop: pending.shop });
    await saveConnection(user.userId, info.type as ConnectionType, grant);
    await adapter.afterConnect?.(grant);
    log.info("oauth.connected", { type: info.type, userId: user.userId.toHexString() });
    return { ok: true, message: `${info.label} connected as ${grant.account.name}.`, returnTo: pending.returnTo, popup: pending.popup, type: info.type };
  } catch (error) {
    log.warn("oauth.callback_failed", { type: info.type, error: error instanceof Error ? error.message : "unknown" });
    return fail(error instanceof OAuthError ? error.message : `Couldn't finish connecting ${info.label}. Try again.`, pending);
  }
}
