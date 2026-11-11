import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl, env } from "../../config/env";
import { oauthRequest, scopeList } from "../http";
import { OAuthError, type Adapter } from "../types";

// Stores and payment accounts. Their events arrive at one platform endpoint per provider
// (signed with the app's secret) and are routed by account or shop to the user who
// connected it, so no user ever handles a webhook secret.

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const need = (v: string | undefined): string => {
  if (!v) throw new OAuthError("This connection isn't configured on the server.");
  return v;
};

export const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/;
export const SHOPIFY_API_VERSION = "2025-07";

export const stripe: Adapter = {
  type: "stripe_account",
  configured: () => Boolean(env().STRIPE_CLIENT_ID && env().STRIPE_SECRET_KEY && env().STRIPE_CONNECT_WEBHOOK_SECRET),
  authorizeUrl: ({ state, redirectUri }) => `https://connect.stripe.com/oauth/authorize?${q({ response_type: "code", client_id: need(env().STRIPE_CLIENT_ID), scope: "read_only", state, redirect_uri: redirectUri })}`,
  async exchange({ code }) {
    const t = await oauthRequest<{ stripe_user_id?: string; scope?: string; livemode?: boolean }>({
      provider: "Stripe",
      url: "https://connect.stripe.com/oauth/token",
      bearer: need(env().STRIPE_SECRET_KEY),
      form: { grant_type: "authorization_code", code },
    });
    if (!t.stripe_user_id?.startsWith("acct_")) throw new OAuthError("Stripe didn't connect an account.");
    const acct = await oauthRequest<{ business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } }; email?: string }>({
      provider: "Stripe",
      url: `https://api.stripe.com/v1/accounts/${t.stripe_user_id}`,
      bearer: need(env().STRIPE_SECRET_KEY),
    }).catch(() => ({}) as Record<string, never>);
    const name = acct.business_profile?.name ?? acct.settings?.dashboard?.display_name ?? acct.email ?? t.stripe_user_id;
    // Events reach us through the platform's Connect webhook; no user token is kept.
    return { account: { id: t.stripe_user_id, name, detail: t.livemode ? "live mode" : "test mode" }, scopes: scopeList(t.scope), secret: {} };
  },
  async revoke(_secret, account) {
    await oauthRequest({ provider: "Stripe", url: "https://connect.stripe.com/oauth/deauthorize", bearer: need(env().STRIPE_SECRET_KEY), form: { client_id: need(env().STRIPE_CLIENT_ID), stripe_user_id: account.id } });
  },
};

// Shopify signs the OAuth redirect: HMAC-SHA256 over the sorted query without hmac.
export function shopifyQueryValid(query: URLSearchParams, secret: string): boolean {
  const given = query.get("hmac") ?? "";
  const message = [...query.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return /^[0-9a-f]{64}$/.test(given) && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

async function shopifyGraphql<T>(shop: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await oauthRequest<{ data?: T; errors?: unknown }>({
    provider: "Shopify",
    url: `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    headers: { "x-shopify-access-token": token },
    json: { query, variables },
  });
  if (!res.data) throw new OAuthError("Shopify rejected the request.");
  return res.data;
}

export const shopify: Adapter = {
  type: "shopify_store",
  configured: () => Boolean(env().SHOPIFY_CLIENT_ID && env().SHOPIFY_CLIENT_SECRET),
  authorizeUrl: ({ state, redirectUri, shop }) => {
    if (!shop || !SHOP_DOMAIN.test(shop)) throw new OAuthError("Enter your store as your-store.myshopify.com.");
    return `https://${shop}/admin/oauth/authorize?${q({ client_id: need(env().SHOPIFY_CLIENT_ID), scope: "read_orders", redirect_uri: redirectUri, state })}`;
  },
  async exchange({ code, query, shop }) {
    const returned = query.get("shop") ?? "";
    if (!shop || returned !== shop || !SHOP_DOMAIN.test(shop)) throw new OAuthError("Shopify returned a different store than the one you entered.");
    if (!shopifyQueryValid(query, need(env().SHOPIFY_CLIENT_SECRET))) throw new OAuthError("Shopify's redirect signature didn't verify.");
    const t = await oauthRequest<{ access_token?: string; scope?: string }>({
      provider: "Shopify",
      url: `https://${shop}/admin/oauth/access_token`,
      json: { client_id: need(env().SHOPIFY_CLIENT_ID), client_secret: need(env().SHOPIFY_CLIENT_SECRET), code },
    });
    if (!t.access_token) throw new OAuthError("Shopify didn't grant access.");
    const info = await shopifyGraphql<{ shop: { name: string } }>(shop, t.access_token, "{ shop { name } }").catch(() => ({ shop: { name: shop } }));
    return { account: { id: shop, name: info.shop.name }, scopes: scopeList(t.scope, ","), secret: { accessToken: t.access_token } };
  },
  // One orders/paid subscription per store, pointed at the platform endpoint. Shopify
  // refuses a duplicate address, which is the idempotent case.
  async afterConnect(grant) {
    const subscribe = (topic: string) =>
      shopifyGraphql<{ webhookSubscriptionCreate: { userErrors: Array<{ message: string }> } }>(
        grant.account.id,
        grant.secret.accessToken!,
        `mutation($url: URL!) { webhookSubscriptionCreate(topic: ${topic}, webhookSubscription: { callbackUrl: $url, format: JSON }) { userErrors { message } } }`,
        { url: `${appUrl()}/api/integrations/shopify/webhook` },
      );
    // Order events start workflows; the uninstall event marks the connection as gone.
    for (const topic of ["ORDERS_PAID", "APP_UNINSTALLED"]) {
      const data = await subscribe(topic);
      const errs = data.webhookSubscriptionCreate.userErrors.filter((e) => !/already been taken/i.test(e.message));
      if (errs.length) throw new OAuthError(`Shopify didn't accept the ${topic.toLowerCase()} webhook: ${errs[0].message.slice(0, 120)}`);
    }
  },
  async revoke(secret, account) {
    if (secret.accessToken) await oauthRequest({ provider: "Shopify", method: "DELETE", url: `https://${account.id}/admin/api_permissions/current.json`, headers: { "x-shopify-access-token": secret.accessToken } });
  },
  async probe(secret, account) {
    if (!secret.accessToken) throw new OAuthError("Shopify access is missing. Reconnect the store.", true);
    const info = await shopifyGraphql<{ shop: { name: string } }>(account.id, secret.accessToken, "{ shop { name } }");
    return `Shopify accepted the connection to ${info.shop.name}.`;
  },
};
