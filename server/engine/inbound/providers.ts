import "server-only";
import nacl from "tweetnacl";
import { hmacMatches, InboundRejected, obj, parseJsonBody, REPLAY_WINDOW_MS, text, type InboundDecision, type InboundRequest } from "./types";

// One verifier per provider, each following that provider's documented signing scheme.
// Payloads keep only what the templates read; customer names, emails and addresses are
// dropped at the door so they never reach run logs.

// GitHub: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(secret, raw body), hex.
export function verifyGithub({ raw, headers, config, secret }: InboundRequest): InboundDecision {
  const signature = headers.get("x-hub-signature-256") ?? "";
  if (!signature.startsWith("sha256=") || !hmacMatches(secret, raw, signature.slice(7), "hex")) throw new InboundRejected("GitHub signature mismatch.");
  const event = headers.get("x-github-event") ?? "";
  const deliveryId = headers.get("x-github-delivery") ?? "";
  if (event === "ping") return { kind: "handshake", reply: { ok: true } };
  if (!/^[0-9a-f-]{16,64}$/i.test(deliveryId)) throw new InboundRejected("Missing X-GitHub-Delivery.");
  const body = parseJsonBody(raw);
  const repository = text(obj(body.repository).full_name) ?? "";
  if (repository.toLowerCase() !== String(config.repository ?? "").toLowerCase()) return { kind: "ignore", reason: "different repository" };

  const action = text(body.action);
  const release = obj(body.release);
  const pr = obj(body.pull_request);
  let kind: string | null = null;
  if (event === "release" && action === "published") kind = "release.published";
  if (event === "pull_request" && action === "closed" && pr.merged === true) kind = "pull_request.merged";
  if (!kind || kind !== config.event) return { kind: "ignore", reason: `event ${event}.${action ?? ""} isn't selected` };

  return {
    kind: "run",
    key: `github:${deliveryId}`,
    payload: {
      event: kind,
      deliveryId,
      repository,
      sender: text(obj(body.sender).login),
      ...(kind === "release.published"
        ? { release: { tag: text(release.tag_name), name: text(release.name), draft: release.draft === true, prerelease: release.prerelease === true, url: text(release.html_url, 500) } }
        : { pullRequest: { number: pr.number, mergeSha: text(pr.merge_commit_sha), baseRef: text(obj(pr.base).ref), url: text(pr.html_url, 500) } }),
    },
  };
}

// Stripe Connect: Stripe-Signature "t=<unix>,v1=<hex>[,v1=…]", HMAC over "<t>.<raw body>"
// with the platform endpoint's secret, inside a timestamp tolerance against replays.
export interface StripeEvent {
  id: string;
  type: string;
  account: string | null;
  livemode: boolean;
  invoice: Record<string, unknown>;
}

export function verifyStripe(raw: Buffer, headers: Headers, secret: string, nowMs: number): StripeEvent {
  const parts = (headers.get("stripe-signature") ?? "").split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1] ?? "";
  const v1 = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!/^\d{9,11}$/.test(t) || !v1.length) throw new InboundRejected("Malformed Stripe-Signature.");
  if (Math.abs(nowMs - Number(t) * 1000) > REPLAY_WINDOW_MS) throw new InboundRejected("Stripe timestamp outside tolerance.");
  const signed = Buffer.concat([Buffer.from(`${t}.`), raw]);
  if (!v1.some((sig) => /^[0-9a-f]{64}$/.test(sig) && hmacMatches(secret, signed, sig, "hex"))) throw new InboundRejected("Stripe signature mismatch.");
  const event = parseJsonBody(raw);
  const id = text(event.id) ?? "";
  if (!/^evt_[A-Za-z0-9]+$/.test(id)) throw new InboundRejected("Missing event id.");
  const invoice = obj(obj(event.data).object);
  return {
    id,
    type: String(event.type ?? ""),
    account: text(event.account),
    livemode: event.livemode === true,
    invoice: { id: text(invoice.id), status: text(invoice.status), amountPaid: invoice.amount_paid ?? null, currency: text(invoice.currency), customerId: text(invoice.customer) },
  };
}

// Shopify: X-Shopify-Hmac-Sha256 = base64 HMAC-SHA256(app secret, raw body).
export interface ShopifyEvent {
  eventId: string;
  topic: string;
  shop: string;
  order: Record<string, unknown>;
}

export function verifyShopify(raw: Buffer, headers: Headers, secret: string): ShopifyEvent {
  if (!hmacMatches(secret, raw, headers.get("x-shopify-hmac-sha256") ?? "", "base64")) throw new InboundRejected("Shopify HMAC mismatch.");
  const shop = (headers.get("x-shopify-shop-domain") ?? "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new InboundRejected("Missing shop domain.");
  const eventId = headers.get("x-shopify-event-id") ?? headers.get("x-shopify-webhook-id") ?? "";
  if (!/^[A-Za-z0-9-]{8,80}$/.test(eventId)) throw new InboundRejected("Missing Shopify event id.");
  const order = parseJsonBody(raw);
  const items = Array.isArray(order.line_items) ? (order.line_items as unknown[]).slice(0, 50).map(obj) : [];
  return {
    eventId,
    topic: headers.get("x-shopify-topic") ?? "",
    shop,
    order: {
      id: text(order.id),
      name: text(order.name),
      financialStatus: text(order.financial_status),
      currency: text(order.currency),
      totalPrice: text(order.total_price),
      cancelled: Boolean(order.cancelled_at),
      skus: items.map((i) => text(i.sku)).filter(Boolean),
    },
  };
}

// Discord interactions: Ed25519 over "<timestamp><raw body>" with the app's public key.
export type DiscordInteraction =
  | { kind: "ping" }
  | { kind: "command"; id: string; guildId: string; name: string; roles: string[]; payload: Record<string, unknown> }
  | { kind: "other" };

export function verifyDiscord(raw: Buffer, headers: Headers, publicKey: string, nowMs: number): DiscordInteraction {
  const signature = headers.get("x-signature-ed25519") ?? "";
  const timestamp = headers.get("x-signature-timestamp") ?? "";
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d{9,11}$/.test(timestamp)) throw new InboundRejected("Missing Discord signature.");
  if (Math.abs(nowMs - Number(timestamp) * 1000) > REPLAY_WINDOW_MS) throw new InboundRejected("Discord timestamp outside tolerance.");
  const valid = nacl.sign.detached.verify(Buffer.concat([Buffer.from(timestamp), raw]), Buffer.from(signature, "hex"), Buffer.from(publicKey, "hex"));
  if (!valid) throw new InboundRejected("Discord signature mismatch.");
  const interaction = parseJsonBody(raw);
  if (interaction.type === 1) return { kind: "ping" };
  const data = obj(interaction.data);
  const id = text(interaction.id) ?? "";
  const guildId = text(interaction.guild_id) ?? "";
  if (interaction.type !== 2 || !/^\d{17,20}$/.test(id) || !guildId) return { kind: "other" };
  const member = obj(interaction.member);
  const options = Object.fromEntries((Array.isArray(data.options) ? data.options : []).map(obj).map((o) => [String(o.name), text(o.value, 64)]));
  return {
    kind: "command",
    id,
    guildId,
    name: String(data.name ?? ""),
    roles: Array.isArray(member.roles) ? member.roles.map(String) : [],
    payload: { interactionId: id, guildId, channelId: text(interaction.channel_id), userId: text(obj(member.user).id), command: data.name, options },
  };
}
