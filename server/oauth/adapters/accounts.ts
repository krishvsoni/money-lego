import "server-only";
import { env } from "../../config/env";
import { expiresAt, oauthRequest, scopeList } from "../http";
import { OAuthError, type Adapter, type ConnectionSecret } from "../types";

// Sign-in providers whose token reads the user's own data: GitHub, Google, Airtable,
// Notion. Each requests only the scopes the templates need (lib/connections/catalog.ts).

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const need = (v: string | undefined): string => {
  if (!v) throw new OAuthError("This connection isn't configured on the server.");
  return v;
};

export const github: Adapter = {
  type: "github_account",
  configured: () => Boolean(env().GITHUB_CLIENT_ID && env().GITHUB_CLIENT_SECRET),
  authorizeUrl: ({ state, redirectUri, challenge }) =>
    `https://github.com/login/oauth/authorize?${q({ client_id: need(env().GITHUB_CLIENT_ID), redirect_uri: redirectUri, scope: "admin:repo_hook read:user", state, code_challenge: challenge, code_challenge_method: "S256", allow_signup: "false" })}`,
  async exchange({ code, redirectUri, verifier }) {
    const t = await oauthRequest({
      provider: "GitHub",
      url: "https://github.com/login/oauth/access_token",
      form: { client_id: need(env().GITHUB_CLIENT_ID), client_secret: need(env().GITHUB_CLIENT_SECRET), code, redirect_uri: redirectUri, code_verifier: verifier },
    });
    if (typeof t.access_token !== "string") throw new OAuthError("GitHub didn't grant access.");
    const me = await oauthRequest<{ id: number; login: string }>({ provider: "GitHub", url: "https://api.github.com/user", bearer: t.access_token });
    return {
      account: { id: String(me.id), name: me.login },
      scopes: scopeList(t.scope, ","),
      secret: { accessToken: t.access_token, refreshToken: typeof t.refresh_token === "string" ? t.refresh_token : undefined, expiresAt: expiresAt(t.expires_in) },
    };
  },
  async revoke(secret) {
    if (!secret.accessToken) return;
    await oauthRequest({
      provider: "GitHub",
      method: "DELETE",
      url: `https://api.github.com/applications/${need(env().GITHUB_CLIENT_ID)}/grant`,
      basic: { user: need(env().GITHUB_CLIENT_ID), password: need(env().GITHUB_CLIENT_SECRET) },
      json: { access_token: secret.accessToken },
    });
  },
  async probe(secret) {
    const me = await oauthRequest<{ login: string }>({ provider: "GitHub", url: "https://api.github.com/user", bearer: secret.accessToken });
    return `GitHub accepted the connection as ${me.login}.`;
  },
};

const GOOGLE_SHEETS = "https://www.googleapis.com/auth/spreadsheets.readonly";

export const google: Adapter = {
  type: "google_account",
  configured: () => Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET),
  authorizeUrl: ({ state, redirectUri, challenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${q({
      client_id: need(env().GOOGLE_CLIENT_ID),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: `openid email ${GOOGLE_SHEETS}`,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })}`,
  async exchange({ code, redirectUri, verifier }) {
    const t = await oauthRequest({
      provider: "Google",
      url: "https://oauth2.googleapis.com/token",
      form: { code, client_id: need(env().GOOGLE_CLIENT_ID), client_secret: need(env().GOOGLE_CLIENT_SECRET), redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier },
    });
    if (typeof t.access_token !== "string") throw new OAuthError("Google didn't grant access.");
    const me = await oauthRequest<{ sub: string; email?: string }>({ provider: "Google", url: "https://openidconnect.googleapis.com/v1/userinfo", bearer: t.access_token });
    // Google's consent screen lets people untick individual permissions; record what was granted.
    const scopes = scopeList(t.scope).map((s) => (s.endsWith("/userinfo.email") ? "email" : s));
    return {
      account: { id: me.sub, name: me.email ?? "Google account" },
      scopes,
      secret: { accessToken: t.access_token, refreshToken: typeof t.refresh_token === "string" ? t.refresh_token : undefined, expiresAt: expiresAt(t.expires_in) },
    };
  },
  async refresh(secret) {
    if (!secret.refreshToken) throw new OAuthError("Google access expired. Reconnect Google.", true);
    const t = await oauthRequest({
      provider: "Google",
      url: "https://oauth2.googleapis.com/token",
      form: { client_id: need(env().GOOGLE_CLIENT_ID), client_secret: need(env().GOOGLE_CLIENT_SECRET), refresh_token: secret.refreshToken, grant_type: "refresh_token" },
    });
    return { ...secret, accessToken: String(t.access_token), expiresAt: expiresAt(t.expires_in) };
  },
  async revoke(secret) {
    const token = secret.refreshToken ?? secret.accessToken;
    if (token) await oauthRequest({ provider: "Google", url: "https://oauth2.googleapis.com/revoke", form: { token } });
  },
  async probe(secret) {
    const me = await oauthRequest<{ email?: string }>({ provider: "Google", url: "https://openidconnect.googleapis.com/v1/userinfo", bearer: secret.accessToken });
    return `Google accepted the connection${me.email ? ` as ${me.email}` : ""}.`;
  },
};

const airtableBasic = () => (env().AIRTABLE_CLIENT_SECRET ? { user: need(env().AIRTABLE_CLIENT_ID), password: env().AIRTABLE_CLIENT_SECRET! } : undefined);

async function airtableToken(form: Record<string, string>): Promise<ConnectionSecret & { scope: string[] }> {
  const t = await oauthRequest({ provider: "Airtable", url: "https://airtable.com/oauth2/v1/token", form: { ...form, client_id: need(env().AIRTABLE_CLIENT_ID) }, basic: airtableBasic() });
  if (typeof t.access_token !== "string") throw new OAuthError("Airtable didn't grant access.");
  return { accessToken: t.access_token, refreshToken: typeof t.refresh_token === "string" ? t.refresh_token : undefined, expiresAt: expiresAt(t.expires_in), scope: scopeList(t.scope) };
}

export const airtable: Adapter = {
  type: "airtable_account",
  configured: () => Boolean(env().AIRTABLE_CLIENT_ID),
  authorizeUrl: ({ state, redirectUri, challenge }) =>
    `https://airtable.com/oauth2/v1/authorize?${q({ client_id: need(env().AIRTABLE_CLIENT_ID), redirect_uri: redirectUri, response_type: "code", scope: "data.records:read schema.bases:read user.email:read", state, code_challenge: challenge, code_challenge_method: "S256" })}`,
  async exchange({ code, redirectUri, verifier }) {
    const { scope, ...secret } = await airtableToken({ code, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier });
    const me = await oauthRequest<{ id: string; email?: string }>({ provider: "Airtable", url: "https://api.airtable.com/v0/meta/whoami", bearer: secret.accessToken });
    return { account: { id: me.id, name: me.email ?? "Airtable account" }, scopes: scope, secret };
  },
  // Airtable refresh tokens are single use: the new one replaces the old in the same write.
  async refresh(secret) {
    if (!secret.refreshToken) throw new OAuthError("Airtable access expired. Reconnect Airtable.", true);
    const next = await airtableToken({ grant_type: "refresh_token", refresh_token: secret.refreshToken });
    return { ...secret, accessToken: next.accessToken, refreshToken: next.refreshToken ?? secret.refreshToken, expiresAt: next.expiresAt };
  },
  async probe(secret) {
    const me = await oauthRequest<{ email?: string }>({ provider: "Airtable", url: "https://api.airtable.com/v0/meta/whoami", bearer: secret.accessToken });
    return `Airtable accepted the connection${me.email ? ` as ${me.email}` : ""}.`;
  },
};

const notionBasic = () => ({ user: need(env().NOTION_CLIENT_ID), password: need(env().NOTION_CLIENT_SECRET) });

export const notion: Adapter = {
  type: "notion_workspace",
  configured: () => Boolean(env().NOTION_CLIENT_ID && env().NOTION_CLIENT_SECRET),
  authorizeUrl: ({ state, redirectUri }) => `https://api.notion.com/v1/oauth/authorize?${q({ client_id: need(env().NOTION_CLIENT_ID), redirect_uri: redirectUri, response_type: "code", owner: "user", state })}`,
  async exchange({ code, redirectUri }) {
    const t = await oauthRequest({ provider: "Notion", url: "https://api.notion.com/v1/oauth/token", basic: notionBasic(), json: { grant_type: "authorization_code", code, redirect_uri: redirectUri } });
    if (typeof t.access_token !== "string") throw new OAuthError("Notion didn't grant access.");
    return {
      account: { id: String(t.workspace_id ?? t.bot_id), name: String(t.workspace_name ?? "Notion workspace") },
      scopes: ["pages"],
      secret: { accessToken: t.access_token, refreshToken: typeof t.refresh_token === "string" ? t.refresh_token : undefined, expiresAt: expiresAt(t.expires_in) },
    };
  },
  async refresh(secret) {
    if (!secret.refreshToken) throw new OAuthError("Notion access expired. Reconnect Notion.", true);
    const t = await oauthRequest({ provider: "Notion", url: "https://api.notion.com/v1/oauth/token", basic: notionBasic(), json: { grant_type: "refresh_token", refresh_token: secret.refreshToken } });
    return { ...secret, accessToken: String(t.access_token), refreshToken: typeof t.refresh_token === "string" ? t.refresh_token : secret.refreshToken, expiresAt: expiresAt(t.expires_in) };
  },
  async revoke(secret) {
    if (secret.accessToken) await oauthRequest({ provider: "Notion", url: "https://api.notion.com/v1/oauth/revoke", basic: notionBasic(), json: { token: secret.accessToken } });
  },
  async probe(secret) {
    await oauthRequest({ provider: "Notion", url: "https://api.notion.com/v1/users/me", bearer: secret.accessToken, headers: { "notion-version": "2022-06-28" } });
    return "Notion accepted the connection. It can only see the pages you shared with it.";
  },
};
