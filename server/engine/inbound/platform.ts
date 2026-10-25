import "server-only";
import type { ConnectionType } from "@/lib/nodes/types";
import { env } from "../../config/env";
import { collections } from "../../db/collections";
import type { WorkflowDoc } from "../../db/types";
import { errors } from "../../errors";
import { log } from "../../log";
import { advanceRun } from "../advance";
import { createRun } from "../runs";
import { verifyDiscord, verifyShopify, verifyStripe } from "./providers";
import { InboundRejected } from "./types";

// Platform endpoints: one per provider for every user. Each event is verified with the
// app's signing secret, then routed by the account it belongs to (Stripe account, store,
// Discord server) to the enabled workflows of whoever connected that account. A delivery
// key per workflow keeps redeliveries from starting a second run.

export interface PlatformResult {
  status: number;
  body: unknown;
}

const ephemeral = (content: string) => ({ type: 4, data: { content, flags: 64 } });

async function routed(route: string): Promise<WorkflowDoc[]> {
  const { workflows } = await collections();
  return workflows.find({ enabled: true, status: "active", inboundRoute: route }).limit(25).toArray();
}

async function start(workflow: WorkflowDoc, type: string, key: string, payload: Record<string, unknown>, budgetMs: number): Promise<boolean> {
  const trigger = workflow.graph.nodes.find((n) => n.type === type);
  if (!trigger) return false;
  const { run, created } = await createRun(workflow, { type, key, payload });
  if (created) await advanceRun(run._id, budgetMs);
  return created;
}

async function markConnection(type: ConnectionType, accountId: string, message: string) {
  const { credentials } = await collections();
  await credentials.updateMany({ type, "account.id": accountId }, { $set: { check: { ok: false, at: new Date(), message } } });
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof InboundRejected) {
      log.warn("platform_webhook.rejected", { reason: error.message });
      throw errors.forbidden();
    }
    throw error;
  }
}

export async function receiveStripe(raw: Buffer, headers: Headers): Promise<PlatformResult> {
  const secret = env().STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) throw errors.notConfigured("Stripe");
  const event = guard(() => verifyStripe(raw, headers, secret, Date.now()));
  if (!event.account) return { status: 200, body: { ignored: true } };
  if (event.type === "account.application.deauthorized") {
    await markConnection("stripe_account", event.account, "Stripe access was removed from the Stripe dashboard. Reconnect to use it.");
    return { status: 200, body: { ok: true } };
  }
  let started = 0;
  for (const w of await routed(`stripe:${event.account}`)) {
    const trigger = w.graph.nodes.find((n) => n.type === "trigger.stripe");
    if (trigger?.config.eventType !== event.type) continue;
    const payload = { eventId: event.id, type: event.type, account: event.account, livemode: event.livemode, invoice: event.invoice };
    if (await start(w, "trigger.stripe", `stripe:${event.id}`, payload, 4_000)) started++;
  }
  return { status: 200, body: { ok: true, started } };
}

export async function receiveShopify(raw: Buffer, headers: Headers): Promise<PlatformResult> {
  const secret = env().SHOPIFY_CLIENT_SECRET;
  if (!secret) throw errors.notConfigured("Shopify");
  const event = guard(() => verifyShopify(raw, headers, secret));
  if (event.topic === "app/uninstalled") {
    await markConnection("shopify_store", event.shop, "The app was uninstalled from the store. Reconnect to use it.");
    return { status: 200, body: { ok: true } };
  }
  if (event.topic !== "orders/paid") return { status: 200, body: { ignored: true } };
  let started = 0;
  for (const w of await routed(`shopify:${event.shop}`)) {
    if (await start(w, "trigger.shopify", `shopify:${event.eventId}`, { eventId: event.eventId, topic: event.topic, shop: event.shop, order: event.order }, 4_000)) started++;
  }
  return { status: 200, body: { ok: true, started } };
}

// Discord expects an answer within three seconds, so runs only get a short head start;
// the scheduler (or the editor's polling) continues them.
export async function receiveDiscord(raw: Buffer, headers: Headers): Promise<PlatformResult> {
  const publicKey = env().DISCORD_PUBLIC_KEY;
  if (!publicKey) throw errors.notConfigured("Discord");
  const interaction = guard(() => verifyDiscord(raw, headers, publicKey, Date.now()));
  if (interaction.kind === "ping") return { status: 200, body: { type: 1 } };
  if (interaction.kind !== "command") return { status: 200, body: ephemeral("This interaction isn't connected to a workflow.") };
  const candidates = await routed(`discord:${interaction.guildId}:${interaction.name}`);
  if (!candidates.length) return { status: 200, body: ephemeral("No workflow is turned on for this command.") };
  const allowed = candidates.filter((w) => {
    const role = String(w.graph.nodes.find((n) => n.type === "trigger.discord")?.config.allowedRoleId ?? "");
    return role && interaction.roles.includes(role);
  });
  if (!allowed.length) return { status: 200, body: ephemeral("You don't have the role needed to start a payout.") };
  for (const w of allowed) await start(w, "trigger.discord", `discord:${interaction.id}`, interaction.payload, 600);
  return { status: 200, body: ephemeral("Request received. Nothing is paid until an operator reviews it and signs in their wallet.") };
}
