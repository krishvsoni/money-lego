import "server-only";
import { randomBytes } from "node:crypto";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { env } from "../config/env";
import { openSecret, sealSecret } from "../crypto/envelope";
import { collections } from "../db/collections";
import type { WorkflowDoc } from "../db/types";
import { errors } from "../errors";
import { log } from "../log";
import { discordAppToken } from "../oauth/adapters/messaging";
import { oauthRequest } from "../oauth/http";
import { openConnection } from "../oauth/store";
import { OAuthError } from "../oauth/types";

// Turning a workflow on wires its trigger up at the provider, with the owner's own
// connection; turning it off takes it down again. What exists remotely is recorded on the
// workflow (remoteHook), so deactivation works from any instance, even after a restart.
//  - GitHub: a repository webhook with a fresh signing secret held only by this workflow.
//  - Discord: the slash command in the connected server.
//  - Stripe and Shopify: events already flow to the platform endpoint; the workflow just
//    subscribes by route (inboundRoute), found with one indexed query per event.

export interface Activation {
  inboundRoute: string | null;
  remoteHook: WorkflowDoc["remoteHook"];
}

const triggerOf = (graph: WorkflowGraph) => graph.nodes.find((n) => n.type.startsWith("trigger."));
export const triggerFingerprint = (graph: WorkflowGraph) => JSON.stringify(triggerOf(graph) ? [triggerOf(graph)!.type, triggerOf(graph)!.config] : null);
const hookAad = (workflowId: string) => `workflow-hook:${workflowId}`;

function publicUrl(): string {
  const url = env().APP_URL;
  if (!/^https:\/\//.test(url) || /\/\/(localhost|127\.|0\.0\.0\.0)/.test(url)) {
    throw errors.validation("Providers can only deliver events to a public https address. Set APP_URL to your public URL (a tunnel like ngrok works for demos).");
  }
  return url;
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof OAuthError) throw errors.validation(error.message);
    throw error;
  }
}

export async function activateTrigger(doc: WorkflowDoc): Promise<Activation> {
  const trigger = triggerOf(doc.graph);
  if (!trigger) return { inboundRoute: null, remoteHook: null };
  const config = trigger.config;

  if (trigger.type === "trigger.github") {
    const repo = String(config.repository ?? "");
    const { secret: conn } = await call(() => openConnection(doc.ownerId, config.credentialId, "github_account"));
    const signing = randomBytes(32).toString("hex");
    const hook = await call(() =>
      oauthRequest<{ id: number }>({
        provider: "GitHub",
        url: `https://api.github.com/repos/${repo}/hooks`,
        bearer: conn.accessToken,
        json: { name: "web", active: true, events: ["release", "pull_request"], config: { url: `${publicUrl()}/api/hooks/${doc.webhookKey}`, content_type: "json", secret: signing, insecure_ssl: "0" } },
      }),
    );
    return { inboundRoute: null, remoteHook: { provider: "github", id: String(hook.id), target: repo, secretEnc: sealSecret(signing, hookAad(doc._id.toHexString())) } };
  }

  if (trigger.type === "trigger.discord") {
    const { account } = await call(() => openConnection(doc.ownerId, config.credentialId, "discord_server"));
    const name = String(config.command ?? "payout-bounty");
    publicUrl();
    const app = env().DISCORD_CLIENT_ID;
    const command = await call(async () =>
      oauthRequest<{ id: string }>({
        provider: "Discord",
        url: `https://discord.com/api/v10/applications/${app}/guilds/${account.id}/commands`,
        bearer: await discordAppToken(),
        json: { name, type: 1, description: "Request a reviewed bounty payout", options: [{ type: 3, name: "bounty_id", description: "The bounty to pay", required: true, max_length: 64 }] },
      }),
    );
    return { inboundRoute: `discord:${account.id}:${name}`, remoteHook: { provider: "discord", id: command.id, target: account.id } };
  }

  if (trigger.type === "trigger.stripe") {
    const { account } = await call(() => openConnection(doc.ownerId, config.credentialId, "stripe_account"));
    return { inboundRoute: `stripe:${account.id}`, remoteHook: null };
  }

  if (trigger.type === "trigger.shopify") {
    const { account } = await call(() => openConnection(doc.ownerId, config.credentialId, "shopify_store"));
    return { inboundRoute: `shopify:${account.id}`, remoteHook: null };
  }
  return { inboundRoute: null, remoteHook: null };
}

// Best effort and idempotent: a hook someone already deleted by hand is simply gone.
export async function deactivateTrigger(doc: WorkflowDoc): Promise<void> {
  const hook = doc.remoteHook;
  if (!hook) return;
  try {
    if (hook.provider === "github") {
      const credentialId = triggerOf(doc.graph)?.config.credentialId;
      const { secret } = await openConnection(doc.ownerId, credentialId, "github_account");
      await oauthRequest({ provider: "GitHub", method: "DELETE", url: `https://api.github.com/repos/${hook.target}/hooks/${hook.id}`, bearer: secret.accessToken });
    }
    if (hook.provider === "discord") {
      const { workflows } = await collections();
      // Another enabled workflow answering the same command in that server keeps it.
      const shared = await workflows.countDocuments({ _id: { $ne: doc._id }, enabled: true, inboundRoute: doc.inboundRoute }, { limit: 1 });
      if (!shared) {
        await oauthRequest({ provider: "Discord", method: "DELETE", url: `https://discord.com/api/v10/applications/${env().DISCORD_CLIENT_ID}/guilds/${hook.target}/commands/${hook.id}`, bearer: await discordAppToken() });
      }
    }
  } catch (error) {
    log.warn("trigger.deactivate_failed", { workflowId: doc._id.toHexString(), provider: hook.provider, error: error instanceof Error ? error.message : "unknown" });
  }
}

export function hookSecret(doc: WorkflowDoc): string | null {
  return doc.remoteHook?.secretEnc ? openSecret(doc.remoteHook.secretEnc, hookAad(doc._id.toHexString())) : null;
}
