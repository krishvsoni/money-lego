import { createHmac } from "node:crypto";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { verifyDiscord, verifyGithub, verifyShopify, verifyStripe } from "@/server/engine/inbound/providers";
import { InboundRejected, type InboundRequest } from "@/server/engine/inbound/types";

const now = Date.UTC(2026, 9, 25, 12, 0, 0);
const req = (raw: string, headers: Record<string, string>, config: Record<string, unknown>, secret: string): InboundRequest => ({ raw: Buffer.from(raw), headers: new Headers(headers), config, secret, nowMs: now });
const hmac = (secret: string, data: string, enc: "hex" | "base64") => createHmac("sha256", secret).update(data).digest(enc);

describe("GitHub", () => {
  const secret = "gh-secret-0123456789abcdef";
  const config = { repository: "octo-demo/community-tools", event: "release.published" };
  const body = JSON.stringify({ action: "published", repository: { full_name: "octo-demo/community-tools" }, release: { tag_name: "v1.4.0", draft: false }, sender: { login: "maintainer", email: "private@example.com" } });
  const headers = (raw: string, event = "release") => ({ "x-hub-signature-256": `sha256=${hmac(secret, raw, "hex")}`, "x-github-event": event, "x-github-delivery": "72d3162e-cc78-11e3-81ab-4c9367dc0958" });

  it("accepts a signed release and keys it by delivery id", () => {
    const d = verifyGithub(req(body, headers(body), config, secret));
    expect(d).toMatchObject({ kind: "run", key: "github:72d3162e-cc78-11e3-81ab-4c9367dc0958", payload: { release: { tag: "v1.4.0" } } });
    expect(JSON.stringify(d)).not.toContain("private@example.com");
  });
  it("rejects a tampered body", () => {
    expect(() => verifyGithub(req(body.replace("v1.4.0", "v9.9.9"), headers(body), config, secret))).toThrow(InboundRejected);
  });
  it("answers pings and ignores other repositories and events", () => {
    expect(verifyGithub(req("{}", headers("{}", "ping"), config, secret)).kind).toBe("handshake");
    const other = body.replace("octo-demo/community-tools", "someone/else");
    expect(verifyGithub(req(other, headers(other), config, secret)).kind).toBe("ignore");
    expect(verifyGithub(req(body, headers(body, "push"), config, secret)).kind).toBe("ignore");
  });
});

describe("Stripe Connect", () => {
  const secret = "whsec_test_0123456789abcdefABCDEF";
  const body = JSON.stringify({ id: "evt_123", type: "invoice.paid", account: "acct_1", livemode: false, data: { object: { id: "in_123", status: "paid", amount_paid: 100, currency: "usd", customer: "cus_1", customer_email: "buyer@example.com" } } });
  const t = Math.floor(now / 1000);
  const sig = (raw: string, ts = t) => new Headers({ "stripe-signature": `t=${ts},v1=${hmac(secret, `${ts}.${raw}`, "hex")}` });

  it("accepts a valid signature inside the tolerance and drops customer details", () => {
    const e = verifyStripe(Buffer.from(body), sig(body), secret, now);
    expect(e).toMatchObject({ id: "evt_123", account: "acct_1", invoice: { id: "in_123", status: "paid" } });
    expect(JSON.stringify(e)).not.toContain("buyer@example.com");
  });
  it("rejects a replay outside the 5 minute window", () => {
    expect(() => verifyStripe(Buffer.from(body), sig(body, t - 600), secret, now)).toThrow(/tolerance/);
  });
  it("rejects a wrong signature", () => {
    expect(() => verifyStripe(Buffer.from(body), new Headers({ "stripe-signature": `t=${t},v1=${"0".repeat(64)}` }), secret, now)).toThrow(/mismatch/);
  });
});

describe("Shopify", () => {
  const secret = "shpss_0123456789abcdef";
  const body = JSON.stringify({ id: 1042, name: "#1042", financial_status: "paid", currency: "USD", cancelled_at: null, line_items: [{ sku: "MUG-BLUE" }], customer: { email: "buyer@example.com" } });
  const headers = (raw: string, extra: Record<string, string> = {}) =>
    new Headers({ "x-shopify-hmac-sha256": hmac(secret, raw, "base64"), "x-shopify-topic": "orders/paid", "x-shopify-shop-domain": "example-store.myshopify.com", "x-shopify-event-id": "98880550-7158-44d4-b7cd-2c97c8a091b5", ...extra });

  it("accepts a valid HMAC and keeps only order facts", () => {
    const e = verifyShopify(Buffer.from(body), headers(body), secret);
    expect(e).toMatchObject({ eventId: "98880550-7158-44d4-b7cd-2c97c8a091b5", shop: "example-store.myshopify.com", order: { id: "1042", financialStatus: "paid", cancelled: false, skus: ["MUG-BLUE"] } });
    expect(JSON.stringify(e)).not.toContain("buyer@example.com");
  });
  it("rejects a bad HMAC", () => {
    expect(() => verifyShopify(Buffer.from(body), headers(body, { "x-shopify-hmac-sha256": "AAAA" }), secret)).toThrow(InboundRejected);
  });
});

describe("Discord", () => {
  const keys = nacl.sign.keyPair();
  const publicKey = Buffer.from(keys.publicKey).toString("hex");
  const ts = String(Math.floor(now / 1000));
  const sign = (raw: string, timestamp = ts) => new Headers({ "x-signature-ed25519": Buffer.from(nacl.sign.detached(Buffer.from(timestamp + raw), keys.secretKey)).toString("hex"), "x-signature-timestamp": timestamp });
  const command = JSON.stringify({ id: "222222222222222222", type: 2, guild_id: "333333333333333333", channel_id: "4", member: { roles: ["111111111111111111"], user: { id: "555555555555555555" } }, data: { name: "payout-bounty", options: [{ name: "bounty_id", value: "BOUNTY-DEMO-17" }] } });

  it("answers a signed ping", () => {
    const ping = JSON.stringify({ type: 1 });
    expect(verifyDiscord(Buffer.from(ping), sign(ping), publicKey, now)).toEqual({ kind: "ping" });
  });
  it("returns the command with its server, roles and options for routing", () => {
    expect(verifyDiscord(Buffer.from(command), sign(command), publicKey, now)).toMatchObject({ kind: "command", guildId: "333333333333333333", name: "payout-bounty", roles: ["111111111111111111"], payload: { options: { bounty_id: "BOUNTY-DEMO-17" } } });
  });
  it("rejects forged and stale requests", () => {
    expect(() => verifyDiscord(Buffer.from(command.replace("17", "18")), sign(command), publicKey, now)).toThrow(/mismatch/);
    expect(() => verifyDiscord(Buffer.from(command), sign(command, String(Number(ts) - 900)), publicKey, now)).toThrow(/tolerance/);
  });
});
