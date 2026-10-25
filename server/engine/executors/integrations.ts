import "server-only";
import type { ObjectId } from "mongodb";
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

  "notify.slack": async ({ config, input, ownerId, signal }) => {
    const url = await webhookOf(ownerId, config.credentialId, "slack_webhook");
    await post(url, { text: String(config.message ?? "").slice(0, 3000) }, signal, "Slack");
    return ok(asObject(input));
  },
};
