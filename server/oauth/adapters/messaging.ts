import "server-only";
import { env } from "../../config/env";
import { oauthRequest, scopeList } from "../http";
import { OAuthError, type Adapter } from "../types";

// Messaging connections. Slack and Discord both hand back a webhook for the one channel
// the user picks on their consent screen, so posting never needs a broad token.

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
const need = (v: string | undefined): string => {
  if (!v) throw new OAuthError("This connection isn't configured on the server.");
  return v;
};
const discordBasic = () => ({ user: need(env().DISCORD_CLIENT_ID), password: need(env().DISCORD_CLIENT_SECRET) });

export const slack: Adapter = {
  type: "slack_webhook",
  configured: () => Boolean(env().SLACK_CLIENT_ID && env().SLACK_CLIENT_SECRET),
  authorizeUrl: ({ state, redirectUri }) => `https://slack.com/oauth/v2/authorize?${q({ client_id: need(env().SLACK_CLIENT_ID), scope: "incoming-webhook", redirect_uri: redirectUri, state })}`,
  async exchange({ code, redirectUri }) {
    const t = await oauthRequest<{ access_token?: string; scope?: string; team?: { id: string; name: string }; incoming_webhook?: { url: string; channel: string; channel_id: string } }>({
      provider: "Slack",
      url: "https://slack.com/api/oauth.v2.access",
      form: { code, client_id: need(env().SLACK_CLIENT_ID), client_secret: need(env().SLACK_CLIENT_SECRET), redirect_uri: redirectUri },
    });
    const hook = t.incoming_webhook;
    if (!hook?.url?.startsWith("https://hooks.slack.com/")) throw new OAuthError("Slack didn't return a channel webhook. Pick a channel on the Slack screen.");
    return {
      account: { id: `${t.team?.id ?? "team"}:${hook.channel_id}`, name: `${hook.channel} in ${t.team?.name ?? "Slack"}` },
      scopes: scopeList(t.scope, ","),
      secret: { webhookUrl: hook.url, accessToken: t.access_token },
    };
  },
  async revoke(secret) {
    if (secret.accessToken) await oauthRequest({ provider: "Slack", url: "https://slack.com/api/auth.revoke", bearer: secret.accessToken, form: {} });
  },
};

export const discordChannel: Adapter = {
  type: "discord_webhook",
  configured: () => Boolean(env().DISCORD_CLIENT_ID && env().DISCORD_CLIENT_SECRET),
  authorizeUrl: ({ state, redirectUri }) => `https://discord.com/oauth2/authorize?${q({ client_id: need(env().DISCORD_CLIENT_ID), response_type: "code", scope: "webhook.incoming", redirect_uri: redirectUri, state, prompt: "consent" })}`,
  async exchange({ code, redirectUri }) {
    const t = await oauthRequest<{ access_token?: string; refresh_token?: string; scope?: string; webhook?: { url: string; channel_id: string; guild_id: string; name: string } }>({
      provider: "Discord",
      url: "https://discord.com/api/oauth2/token",
      basic: discordBasic(),
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    });
    const hook = t.webhook;
    if (!hook?.url?.startsWith("https://discord.com/api/webhooks/")) throw new OAuthError("Discord didn't return a channel webhook. Pick a channel on the Discord screen.");
    // The webhook is all we use; give the user token straight back.
    if (t.access_token) await oauthRequest({ provider: "Discord", url: "https://discord.com/api/oauth2/token/revoke", basic: discordBasic(), form: { token: t.access_token, token_type_hint: "access_token" } }).catch(() => null);
    return { account: { id: `${hook.guild_id}:${hook.channel_id}`, name: `#${hook.name}`, detail: `server ${hook.guild_id}` }, scopes: scopeList(t.scope), secret: { webhookUrl: hook.url } };
  },
  // Deleting the webhook removes Money Lego's ability to post there at all.
  async revoke(secret) {
    if (secret.webhookUrl) await oauthRequest({ provider: "Discord", method: "DELETE", url: secret.webhookUrl });
  },
  async probe(secret) {
    const hook = await oauthRequest<{ name?: string }>({ provider: "Discord", url: secret.webhookUrl! });
    return `Discord found the channel webhook${hook.name ? ` "${hook.name}"` : ""}.`;
  },
};

export const discordServer: Adapter = {
  type: "discord_server",
  configured: () => Boolean(env().DISCORD_CLIENT_ID && env().DISCORD_CLIENT_SECRET && env().DISCORD_PUBLIC_KEY),
  // permissions=0: the bot joins only so the command can be used; it can't read messages.
  authorizeUrl: ({ state, redirectUri }) =>
    `https://discord.com/oauth2/authorize?${q({ client_id: need(env().DISCORD_CLIENT_ID), response_type: "code", scope: "bot applications.commands", permissions: "0", redirect_uri: redirectUri, state })}`,
  async exchange({ code, redirectUri }) {
    const t = await oauthRequest<{ access_token?: string; scope?: string; guild?: { id: string; name: string } }>({
      provider: "Discord",
      url: "https://discord.com/api/oauth2/token",
      basic: discordBasic(),
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    });
    if (!t.guild?.id) throw new OAuthError("Discord didn't say which server the bot was added to.");
    if (t.access_token) await oauthRequest({ provider: "Discord", url: "https://discord.com/api/oauth2/token/revoke", basic: discordBasic(), form: { token: t.access_token } }).catch(() => null);
    return { account: { id: t.guild.id, name: t.guild.name }, scopes: scopeList(t.scope), secret: {} };
  },
};

// Discord application commands are registered with the app's own client-credentials token,
// limited to the applications.commands.update scope, and only in servers that installed it.
export async function discordAppToken(): Promise<string> {
  const t = await oauthRequest({ provider: "Discord", url: "https://discord.com/api/oauth2/token", basic: discordBasic(), form: { grant_type: "client_credentials", scope: "applications.commands.update" } });
  if (typeof t.access_token !== "string") throw new OAuthError("Discord didn't issue an app token.");
  return t.access_token;
}

