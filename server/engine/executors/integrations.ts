import "server-only";
import { readCredentialSecret } from "../../workflows/credentials";
import { safeFetch } from "../safe-fetch";
import { asObject, NodeError, ok, type Executor } from "../types";
import { parseJson } from "./core";

// Each connector does its own authentication and treats a non-2xx answer as a failure
// with the status in the message. None of these retry automatically: a repeated POST
// could post the same message twice.

async function post(url: string, body: unknown, signal: AbortSignal, service: string) {
  const res = await safeFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 10_000, signal });
  if (res.status < 200 || res.status >= 300) throw new NodeError(`${service} refused the message (HTTP ${res.status}).`);
}

export const integrationExecutors: Record<string, Executor> = {
  "http.request": async ({ config, ownerId, signal }) => {
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
    const res = await safeFetch(String(config.url ?? ""), { method, headers, body, timeoutMs: Math.min(30, Number(config.timeoutSeconds) || 10) * 1000, signal });
    if (res.status >= 400) throw new NodeError(`The server answered HTTP ${res.status}.`);
    return ok({ status: res.status, body: res.body });
  },

  "notify.discord": async ({ config, input, ownerId, signal }) => {
    const url = await readCredentialSecret(ownerId, config.credentialId, "discord_webhook");
    await post(url, { content: String(config.message ?? "").slice(0, 2000), allowed_mentions: { parse: [] } }, signal, "Discord");
    return ok(asObject(input));
  },

  "notify.slack": async ({ config, input, ownerId, signal }) => {
    const url = await readCredentialSecret(ownerId, config.credentialId, "slack_webhook");
    await post(url, { text: String(config.message ?? "").slice(0, 3000) }, signal, "Slack");
    return ok(asObject(input));
  },
};
