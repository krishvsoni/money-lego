import "server-only";
import type { ObjectId } from "mongodb";
import { isAppError } from "../../errors";
import { searchProducts } from "../../integrations/channel3";
import { ZAPIER_HOOK } from "../../workflows/credential-schema";
import { readCredentialSecret } from "../../workflows/credentials";
import { safeFetch } from "../safe-fetch";
import { asObject, NodeError, ok, type Executor } from "../types";
import { getPath } from "@/lib/workflow/expressions";
import { connection } from "./connectors";
import { parseJson, typeMatches } from "./core";

// Each connector does its own authentication and treats a non-2xx answer as a failure
// with the status in the message. None of these retry automatically: a repeated POST
// could post the same message twice.

async function post(url: string, body: unknown, signal: AbortSignal, service: string) {
  const res = await safeFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 10_000, signal });
  if (res.status < 200 || res.status >= 300) throw new NodeError(`${service} refused the message (HTTP ${res.status}).`);
}

async function webhookOf(ownerId: ObjectId, id: unknown, type: "discord_webhook" | "slack_webhook"): Promise<string> {
  const { secret } = await connection(ownerId, id, type);
  if (!secret.webhookUrl) throw new NodeError("This channel connection is incomplete. Reconnect it in Connections.");
  return secret.webhookUrl;
}

export const integrationExecutors: Record<string, Executor> = {
  // Zapier Catch Hook: the URL is the user's secret, and only hooks.zapier.com is accepted.
  "zapier.send": async ({ config, input, ownerId, signal }) => {
    const url = await readCredentialSecret(ownerId, config.credentialId, "zapier_hook");
    if (!ZAPIER_HOOK.test(url)) throw new NodeError("That Zapier credential isn't a hooks.zapier.com Catch Hook URL.");
    const pairs = (Array.isArray(config.fields) ? config.fields : []) as Array<{ key: string; value: unknown }>;
    const payload = Object.fromEntries(pairs.filter((p) => p.key && !["__proto__", "constructor", "prototype"].includes(p.key)).map((p) => [p.key, p.value]));
    const res = await safeFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), timeoutMs: 10_000, signal });
    if (res.status < 200 || res.status >= 300) throw new NodeError(`Zapier refused the payload (HTTP ${res.status}).`);
    const body = asObject(res.body);
    return ok({ ...asObject(input), zapier: { status: String(body.status ?? "success"), attempt: body.attempt ?? null } });
  },

  "shop.search": async ({ config, input, log }) => {
    const query = String(config.query ?? "").trim();
    if (!query || query.includes("{{")) throw new NodeError("Looking for didn't resolve to a search request.");
    const maxPrice = Number(String(config.maxPrice ?? "").trim() || 0);
    let products;
    try {
      products = await searchProducts({ query, maxPrice: Number.isFinite(maxPrice) ? maxPrice : null, limit: Number(config.limit ?? 5) });
    } catch (error) {
      throw new NodeError(isAppError(error) ? error.message : "Channel3 search failed.");
    }
    log(`Channel3 returned ${products.length} product(s) for "${query.slice(0, 60)}".`);
    return ok({ ...asObject(input), products, productCount: products.length });
  },

  "http.request": async ({ config, input, ownerId, signal }) => {
    const method = String(config.method ?? "GET");
    const headers: Record<string, string> = { accept: "application/json" };
    if (config.credentialId) {
      const { header, value } = JSON.parse(await readCredentialSecret(ownerId, config.credentialId, "http_header")) as { header: string; value: string };
      headers[header] = value;
    }
    let body: string | undefined;
    if (!["GET", "DELETE"].includes(method)) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(parseJson(config.body, "JSON body"));
    }
    const url = String(config.url ?? "");
    const allowedHost = String(config.allowedHost ?? "").trim().toLowerCase();
    if (allowedHost) {
      let host = "";
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        throw new NodeError("That URL isn't valid.");
      }
      if (host !== allowedHost) throw new NodeError(`The URL points at ${host || "an unknown host"}, not the allowed host ${allowedHost}. Nothing was sent.`);
    }
    const res = await safeFetch(url, { method, headers, body, timeoutMs: Math.min(30, Number(config.timeoutSeconds) || 10) * 1000, signal });
    if (res.status >= 400) throw new NodeError(`The server answered HTTP ${res.status}.`);
    const response = { status: res.status, body: res.body };
    const rules = (Array.isArray(config.responseRules) ? config.responseRules : []) as Array<{ path?: string; type?: string }>;
    const failures = rules.filter((r) => r.path && !typeMatches(getPath(response, r.path), String(r.type))).map((r) => `${r.path} must be ${r.type}`);
    if (failures.length) throw new NodeError(`The response didn't have the expected shape: ${failures.join("; ")}.`);
    return ok(config.keepInput ? { ...asObject(input), response } : response);
  },

  "notify.discord": async ({ config, input, ownerId, signal }) => {
    const url = await webhookOf(ownerId, config.credentialId, "discord_webhook");
    await post(url, { content: String(config.message ?? "").slice(0, 2000), allowed_mentions: { parse: [] } }, signal, "Discord");
    return ok(asObject(input));
  },

  // A direct message from the app's bot to one member. Slack answers 200 with ok:false on
  // errors, so the body is checked, not just the status.
  "notify.slack_dm": async ({ config, input, ownerId, signal }) => {
    const userId = String(config.userId ?? "").trim();
    if (!/^[UW][A-Z0-9]{6,}$/.test(userId)) throw new NodeError(`"${userId.slice(0, 40)}" isn't a Slack member ID (like U0123ABCD).`);
    const { secret } = await connection(ownerId, config.credentialId, "slack_webhook");
    if (!secret.accessToken) throw new NodeError("This Slack connection can't send direct messages. Reconnect Slack in Connections.");
    const res = await safeFetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${secret.accessToken}` },
      body: JSON.stringify({ channel: userId, text: String(config.message ?? "").slice(0, 3000) }),
      timeoutMs: 10_000,
      signal,
    });
    const body = asObject(res.body);
    if (res.status !== 200 || body.ok !== true) {
      const reason = String(body.error ?? `HTTP ${res.status}`);
      const hint = reason === "missing_scope" ? " Reconnect Slack in Connections to grant direct messages." : reason === "user_not_found" || reason === "channel_not_found" ? " Check the member ID." : "";
      throw new NodeError(`Slack didn't deliver the direct message (${reason}).${hint}`);
    }
    return ok({ ...asObject(input), slackDm: { channel: String(body.channel ?? ""), ts: String(body.ts ?? "") } });
  },

  "notify.slack": async ({ config, input, ownerId, signal }) => {
    const url = await webhookOf(ownerId, config.credentialId, "slack_webhook");
    await post(url, { text: String(config.message ?? "").slice(0, 3000) }, signal, "Slack");
    return ok(asObject(input));
  },
};
