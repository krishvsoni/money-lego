import "server-only";
import { env } from "../config/env";
import { errors } from "../errors";
import { paypalRequest } from "./client";

// PayPal webhook verification by postback: PayPal checks the transmission signature
// against the event and our webhook id. The event goes back as the exact bytes we
// received; re-serialising it can change numbers or key order and fail verification.

const HEADER = {
  algo: "paypal-auth-algo",
  certUrl: "paypal-cert-url",
  id: "paypal-transmission-id",
  sig: "paypal-transmission-sig",
  time: "paypal-transmission-time",
} as const;

export class WebhookRejected extends Error {}

export async function verifyPaypalWebhook(raw: Buffer, headers: Headers): Promise<boolean> {
  const webhookId = env().PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw errors.notConfigured("PAYPAL_WEBHOOK_ID");
  const h = Object.fromEntries(Object.entries(HEADER).map(([k, name]) => [k, headers.get(name) ?? ""])) as Record<keyof typeof HEADER, string>;
  if (!h.algo || !h.certUrl || !h.id || !h.sig || !h.time) throw new WebhookRejected("Missing PayPal transmission headers.");
  // The certificate must come from PayPal; PayPal checks this too, it costs nothing to check first.
  let cert: URL;
  try {
    cert = new URL(h.certUrl);
  } catch {
    throw new WebhookRejected("Bad certificate URL.");
  }
  if (cert.protocol !== "https:" || !/(^|\.)paypal\.com$/.test(cert.hostname)) throw new WebhookRejected("Certificate is not hosted by PayPal.");

  const event = raw.toString("utf8");
  try {
    JSON.parse(event);
  } catch {
    throw new WebhookRejected("Body is not JSON.");
  }
  const rawBody =
    `{"auth_algo":${JSON.stringify(h.algo)},"cert_url":${JSON.stringify(h.certUrl)},"transmission_id":${JSON.stringify(h.id)},` +
    `"transmission_sig":${JSON.stringify(h.sig)},"transmission_time":${JSON.stringify(h.time)},"webhook_id":${JSON.stringify(webhookId)},"webhook_event":${event}}`;
  const result = await paypalRequest<{ verification_status?: string }>({ path: "/v1/notifications/verify-webhook-signature", rawBody });
  return result.verification_status === "SUCCESS";
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v ? v.slice(0, max) : null);

export interface ParsedEvent {
  id: string;
  eventType: string;
  resourceType: string | null;
  resource: Obj;
  resourceId: string | null;
  reference: string | null;
  createTime: string | null;
}

// Where Money Lego's reference can sit, by resource: captures and subscriptions carry
// custom_id, orders carry it per purchase unit, invoices carry detail.reference.
export function parseEvent(raw: Buffer): ParsedEvent {
  const event = obj(JSON.parse(raw.toString("utf8")));
  const id = str(event.id, 80) ?? "";
  if (!/^WH-[A-Z0-9-]{8,80}$/i.test(id)) throw new WebhookRejected("Missing event id.");
  const resource = obj(event.resource);
  const invoice = resource.detail ? resource : obj(resource.invoice);
  const units = Array.isArray(resource.purchase_units) ? (resource.purchase_units as unknown[]).map(obj) : [];
  const reference = str(resource.custom_id) ?? str(units[0]?.custom_id) ?? str(obj(invoice.detail).reference);
  const batchId = str(obj(resource.batch_header).payout_batch_id);
  return {
    id,
    eventType: str(event.event_type, 80) ?? "",
    resourceType: str(event.resource_type, 60),
    resource,
    resourceId: batchId ?? str(resource.payout_item_id) ?? str(invoice.id) ?? str(resource.id),
    reference,
    createTime: str(event.create_time, 40),
  };
}
