import "server-only";
import type { ObjectId } from "mongodb";
import { keyFromReference, PAYPAL_EVENT_TYPES, referenceFor, toMinor, toPaypalValue } from "@/lib/paypal/types";
import { env } from "../config/env";
import { collections, isDuplicateKeyError } from "../db/collections";
import type { PaypalResourceDoc, WorkflowDoc } from "../db/types";
import { errors, isAppError } from "../errors";
import { log } from "../log";
import { advanceRun } from "../engine/advance";
import { createRun } from "../engine/runs";
import * as paypal from "./api";
import { PaypalError } from "./client";
import { maskEmail, minorOf, recordResource } from "./resources";
import { parseEvent, verifyPaypalWebhook, WebhookRejected, type ParsedEvent } from "./webhooks";

// Everything that arrives from PayPal: buyer checkouts on a workflow's hosted page, and
// verified webhook events. Both start runs with a key derived from PayPal's own ids
// (capture id, event id), so the capture API response and the webhook for the same
// capture start exactly one run between them.

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

async function checkoutWorkflow(key: string): Promise<{ workflow: WorkflowDoc; config: Obj } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return null;
  const { workflows } = await collections();
  const workflow = await workflows.findOne({ webhookKey: key, status: "active" });
  const trigger = workflow?.graph.nodes.find((n) => n.type === "trigger.paypal_checkout");
  return workflow && trigger ? { workflow, config: trigger.config } : null;
}

function priceOf(config: Obj): { currency: "USD" | "EUR" | "GBP" | "CAD" | "AUD"; minor: bigint } {
  const currency = String(config.currency ?? "USD").toUpperCase() as "USD";
  const minor = toMinor(String(config.amount ?? ""), "Price");
  if (minor <= 0n) throw errors.validation("This checkout has no price set.");
  return { currency, minor };
}

export interface PublicCheckout {
  accepting: boolean;
  workflowName: string;
  itemName: string;
  description: string;
  amount: string;
  currency: string;
  clientId: string | null;
  environment: "sandbox" | "live";
}

// What the public pay page may know: the price and product, never the workflow's graph.
export async function publicCheckout(key: string): Promise<PublicCheckout> {
  const found = await checkoutWorkflow(key);
  if (!found) throw errors.notFound("Checkout");
  const { currency, minor } = priceOf(found.config);
  const e = env();
  return {
    accepting: found.workflow.enabled && Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET),
    workflowName: found.workflow.name,
    itemName: String(found.config.itemName || found.workflow.name).slice(0, 120),
    description: String(found.config.description ?? "").slice(0, 300),
    amount: toPaypalValue(minor),
    currency,
    clientId: e.PAYPAL_CLIENT_ID ?? null,
    environment: e.PAYPAL_ENVIRONMENT,
  };
}

const ownerOf = (w: WorkflowDoc) => ({ ownerId: w.ownerId, workflowId: w._id, runId: null, nodeId: null });

export async function createCheckoutOrder(key: string, requestKey: string): Promise<{ id: string }> {
  const found = await checkoutWorkflow(key);
  if (!found || !found.workflow.enabled) throw errors.invalidState("This checkout isn't accepting payments right now.");
  const { currency, minor } = priceOf(found.config);
  const order = await paypal.createOrder({
    currency,
    amountMinor: minor,
    itemName: String(found.config.itemName || found.workflow.name),
    description: String(found.config.description || found.config.itemName || found.workflow.name),
    customId: referenceFor(key),
    requestId: `ml-co-${key}-${requestKey}`,
  });
  await recordResource({ kind: "order", paypalId: order.id, status: order.status, amount: { currency_code: currency, value: toPaypalValue(minor) }, detail: { item: String(found.config.itemName ?? "") }, owner: ownerOf(found.workflow) });
  return { id: order.id };
}

export function capturePayload(source: "checkout" | "webhook", capture: paypal.CaptureObject, order?: paypal.OrderObject | null) {
  const b = capture.seller_receivable_breakdown;
  return {
    source,
    eventType: "PAYMENT.CAPTURE.COMPLETED",
    orderId: order?.id ?? capture.supplementary_data?.related_ids?.order_id ?? null,
    captureId: capture.id,
    status: capture.status,
    currency: capture.amount?.currency_code ?? null,
    amount: capture.amount?.value ?? null,
    amountMinor: minorOf(capture.amount),
    fee: b?.paypal_fee?.value ?? null,
    net: b?.net_amount?.value ?? capture.amount?.value ?? null,
    netMinor: minorOf(b?.net_amount ?? capture.amount),
    payer: order?.payer ? { id: order.payer.payer_id ?? null, country: order.payer.address?.country_code ?? null, email: maskEmail(order.payer.email_address) } : null,
    reference: capture.custom_id ?? null,
    capturedAt: capture.create_time ?? null,
  };
}

async function startCaptureRun(workflow: WorkflowDoc, payload: ReturnType<typeof capturePayload>, budgetMs: number): Promise<ObjectId | null> {
  if (!workflow.enabled || payload.status !== "COMPLETED") return null;
  const { run, created } = await createRun(workflow, { type: "trigger.paypal_checkout", key: `paypal:capture:${payload.captureId}`, payload });
  if (created) await advanceRun(run._id, budgetMs);
  return run._id;
}

export async function captureCheckoutOrder(key: string, orderId: string) {
  const found = await checkoutWorkflow(key);
  if (!found) throw errors.notFound("Checkout");
  if (!/^[A-Z0-9]{6,40}$/i.test(orderId)) throw errors.validation("That isn't a PayPal order id.");
  // The order must be one this checkout created; a buyer can't redirect another order here.
  const before = await paypal.getOrder(orderId);
  if (before.purchase_units?.[0]?.custom_id !== referenceFor(key)) throw errors.forbidden();

  let order: paypal.OrderObject;
  try {
    order = before.status === "COMPLETED" ? before : await paypal.captureOrder(orderId, `ml-cap-${orderId}`);
  } catch (error) {
    if (error instanceof PaypalError && error.issue === "ORDER_ALREADY_CAPTURED") order = await paypal.getOrder(orderId);
    else throw error;
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  await recordResource({ kind: "order", paypalId: order.id, status: order.status, amount: order.purchase_units?.[0]?.amount, owner: ownerOf(found.workflow) });
  if (!capture) return { status: order.status, captureStatus: null, captureId: null, runId: null };
  await recordResource({
    kind: "capture",
    paypalId: capture.id,
    status: capture.status,
    amount: capture.amount,
    counterparty: maskEmail(order.payer?.email_address),
    detail: { orderId: order.id, fee: capture.seller_receivable_breakdown?.paypal_fee?.value ?? null, net: capture.seller_receivable_breakdown?.net_amount?.value ?? null },
    owner: ownerOf(found.workflow),
  });
  const runId = await startCaptureRun(found.workflow, capturePayload("checkout", capture, order), 4_000).catch((error) => {
    log.error("paypal.checkout_run_failed", { workflowId: found.workflow._id.toHexString(), error: isAppError(error) ? error.message : "unknown" });
    return null;
  });
  return { status: order.status, captureStatus: capture.status, captureId: capture.id, runId: runId?.toHexString() ?? null };
}

// ---------- webhooks ----------

function summarise(e: ParsedEvent): Record<string, unknown> {
  const r = e.resource;
  const amount = obj(r.amount);
  const header = obj(r.batch_header);
  const item = obj(r.payout_item);
  return {
    id: e.resourceId,
    status: r.status ?? header.batch_status ?? r.transaction_status ?? null,
    amount: amount.value ?? obj(header.amount).value ?? obj(item.amount).value ?? null,
    currency: amount.currency_code ?? obj(header.amount).currency ?? obj(item.amount).currency ?? null,
    reason: obj(r.status_details).reason ?? r.reason ?? null,
  };
}

async function mirror(e: ParsedEvent, owner: Pick<PaypalResourceDoc, "ownerId" | "workflowId"> | null): Promise<void> {
  const r = e.resource;
  const s = summarise(e);
  const amount = s.amount && s.currency ? { value: String(s.amount), currency_code: String(s.currency) } : null;
  const own = owner?.ownerId && owner.workflowId ? { ownerId: owner.ownerId, workflowId: owner.workflowId, runId: null, nodeId: null } : null;
  if (e.eventType.startsWith("PAYMENT.CAPTURE.") && e.resourceId) {
    const status = e.eventType === "PAYMENT.CAPTURE.REFUNDED" ? "REFUNDED" : String(s.status ?? e.eventType.split(".").pop());
    await recordResource({ kind: "capture", paypalId: e.eventType === "PAYMENT.CAPTURE.REFUNDED" ? String(obj(obj(r.supplementary_data).related_ids).capture_id ?? e.resourceId) : e.resourceId, status, amount, owner: own });
  } else if (e.eventType.startsWith("CHECKOUT.ORDER.") && e.resourceId) {
    await recordResource({ kind: "order", paypalId: e.resourceId, status: String(s.status ?? e.eventType.split(".").pop()), owner: own });
  } else if (e.eventType.startsWith("INVOICING.") && e.resourceId) {
    await recordResource({ kind: "invoice", paypalId: e.resourceId, status: String(obj(r.invoice ?? r).status ?? e.eventType.split(".").pop()), owner: own });
  } else if (e.eventType.startsWith("PAYMENT.PAYOUTSBATCH.") && e.resourceId) {
    await recordResource({ kind: "payout_batch", paypalId: e.resourceId, status: String(s.status ?? e.eventType.split(".").pop()) });
  } else if (e.eventType.startsWith("PAYMENT.PAYOUTS-ITEM.") && e.resourceId) {
    await recordResource({ kind: "payout_item", paypalId: e.resourceId, status: String(r.transaction_status ?? e.eventType.split(".").pop()), amount, detail: { batchId: r.payout_batch_id ?? null } });
  } else if (e.eventType.startsWith("BILLING.SUBSCRIPTION.") && e.resourceId) {
    await recordResource({ kind: "subscription", paypalId: e.resourceId, status: String(s.status ?? e.eventType.split(".").pop()), owner: own });
  }
}

// Runs paused on a payout batch re-check as soon as PayPal reports a change to it.
async function wakePayoutWaiters(e: ParsedEvent): Promise<void> {
  const batchId = e.eventType.startsWith("PAYMENT.PAYOUTSBATCH.") ? e.resourceId : (obj(e.resource).payout_batch_id as string | undefined);
  const orderId = e.eventType.startsWith("CHECKOUT.ORDER.") ? e.resourceId : null;
  const ref = batchId ? `payout:${batchId}` : orderId ? `order:${orderId}` : null;
  if (!ref) return;
  const { workflowRuns } = await collections();
  const waiting = await workflowRuns.find({ status: "waiting", "waiting.ref": ref }, { projection: { _id: 1 } }).limit(10).toArray();
  for (const r of waiting) {
    await workflowRuns.updateOne({ _id: r._id }, { $set: { nextWakeAt: new Date() } });
    await advanceRun(r._id, 3_000).catch(() => null);
  }
}

export async function receivePaypalWebhook(raw: Buffer, headers: Headers): Promise<{ status: number; body: unknown }> {
  let verified: boolean;
  try {
    verified = await verifyPaypalWebhook(raw, headers);
  } catch (error) {
    if (error instanceof WebhookRejected) {
      log.warn("paypal.webhook_rejected", { reason: error.message });
      throw errors.forbidden();
    }
    throw error;
  }
  if (!verified) {
    log.warn("paypal.webhook_unverified", { transmission: headers.get("paypal-transmission-id") });
    throw errors.forbidden();
  }
  let event: ParsedEvent;
  try {
    event = parseEvent(raw);
  } catch {
    throw errors.validation("Unreadable PayPal event.");
  }

  const { paypalEvents, workflows, paypalResources } = await collections();
  try {
    await paypalEvents.insertOne({
      _id: event.id,
      eventType: event.eventType,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      reference: event.reference,
      verified: true,
      summary: summarise(event),
      routed: [],
      outcome: "ignored",
      receivedAt: new Date(),
    });
  } catch (error) {
    // PayPal redelivers until it gets a 2xx; the first delivery already did the work.
    if (isDuplicateKeyError(error)) return { status: 200, body: { duplicate: true } };
    throw error;
  }

  // Whose event is it? Our reference (custom_id / invoice reference) names the workflow;
  // otherwise an object we created and recorded names the owner.
  const key = keyFromReference(event.reference);
  const source = key ? await workflows.findOne({ webhookKey: key, status: "active" }) : null;
  const known = !source && event.resourceId ? await paypalResources.findOne({ paypalId: event.resourceId, ownerId: { $ne: null } }) : null;
  const ownerId = source?.ownerId ?? known?.ownerId ?? null;
  await mirror(event, source ? { ownerId: source.ownerId, workflowId: source._id } : known ? { ownerId: known.ownerId, workflowId: known.workflowId } : null);
  await wakePayoutWaiters(event);

  const routed: Array<{ workflowId: ObjectId; runId: ObjectId | null }> = [];
  if (source && event.eventType === "PAYMENT.CAPTURE.COMPLETED" && source.graph.nodes.some((n) => n.type === "trigger.paypal_checkout")) {
    const runId = await startCaptureRun(source, capturePayload("webhook", event.resource as unknown as paypal.CaptureObject), 3_000).catch(() => null);
    routed.push({ workflowId: source._id, runId });
  }
  if (ownerId && PAYPAL_EVENT_TYPES.includes(event.eventType)) {
    const subscribed = await workflows.find({ enabled: true, status: "active", inboundRoute: `paypal:${ownerId.toHexString()}` }).limit(25).toArray();
    for (const w of subscribed) {
      const trigger = w.graph.nodes.find((n) => n.type === "trigger.paypal_event");
      if (trigger?.config.eventType !== event.eventType) continue;
      const payload = { source: "webhook", eventId: event.id, eventType: event.eventType, resourceType: event.resourceType, resourceId: event.resourceId, reference: event.reference, createTime: event.createTime, resource: summarise(event) };
      try {
        const { run, created } = await createRun(w, { type: "trigger.paypal_event", key: `paypal:event:${event.id}`, payload });
        if (created) await advanceRun(run._id, 3_000);
        routed.push({ workflowId: w._id, runId: run._id });
      } catch (error) {
        log.warn("paypal.event_run_failed", { workflowId: w._id.toHexString(), error: isAppError(error) ? error.message : "unknown" });
        routed.push({ workflowId: w._id, runId: null });
      }
    }
  }
  await paypalEvents.updateOne({ _id: event.id }, { $set: { routed, outcome: routed.some((r) => r.runId) ? "started" : ownerId ? "updated" : "ignored" } });
  return { status: 200, body: { ok: true, started: routed.filter((r) => r.runId).length } };
}
