import "server-only";
import { ObjectId } from "mongodb";
import { env } from "../config/env";
import { collections, isDuplicateKeyError } from "../db/collections";
import { errors } from "../errors";
import { syncFromProvider } from "../executions/reconcile";
import { updateWithRetry } from "../executions/repository";
import { log } from "../log";
import { verifyWebhookSignature, webhookDedupeKey } from "../multihopper/webhook-signature";

// The webhook payload shape is undocumented, so a webhook is treated as a signed hint that
// a transfer changed. We record it durably (deduplicated), then fetch the transfer from the
// API for the authoritative state. A dropped or reordered webhook can't corrupt a run.

function findTransferId(payload: unknown): number | null {
  const p = payload as Record<string, unknown> | null;
  const candidates = [
    (p?.data as Record<string, unknown> | undefined)?.transferId,
    ((p?.data as Record<string, unknown> | undefined)?.transfer as Record<string, unknown> | undefined)?.id,
    (p?.data as Record<string, unknown> | undefined)?.id,
    (p?.transfer as Record<string, unknown> | undefined)?.id,
    p?.transferId,
  ];
  const hit = candidates.find((c) => Number.isInteger(c) || (typeof c === "string" && /^\d+$/.test(c)));
  return hit === undefined ? null : Number(hit);
}

function findEventType(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  const value = p?.type ?? p?.event ?? p?.eventType;
  return typeof value === "string" ? value.slice(0, 64) : null;
}

export async function receiveWebhook(rawBody: Buffer, signatureHeader: string | null) {
  const secret = env().MULTIHOPPER_WEBHOOK_SECRET;
  if (!secret) throw errors.notConfigured("Webhook verification");
  if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
    log.warn("webhook.bad_signature", { bytes: rawBody.length, hasHeader: Boolean(signatureHeader) });
    throw errors.forbidden();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw errors.validation("Webhook body is not JSON.");
  }

  const { webhookEvents, executions } = await collections();
  const eventId = new ObjectId();
  const transferId = findTransferId(payload);
  try {
    await webhookEvents.insertOne({
      _id: eventId,
      dedupeKey: webhookDedupeKey(rawBody),
      eventType: findEventType(payload),
      providerTransferId: transferId,
      receivedAt: new Date(),
      processedAt: null,
      outcome: "pending",
      attempts: 1,
      payload,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return { duplicate: true };
    throw error;
  }

  const finish = (outcome: "applied" | "ignored" | "failed") =>
    webhookEvents.updateOne({ _id: eventId }, { $set: { outcome, processedAt: new Date() } });

  const execution = transferId === null ? null : await executions.findOne({ providerTransferId: transferId });
  if (!execution) {
    await finish("ignored");
    return { duplicate: false, applied: false };
  }

  try {
    await syncFromProvider(execution, "webhook");
    await finish("applied");
    return { duplicate: false, applied: true };
  } catch (error) {
    // The event is stored and the run is queued for the reconciler, so acknowledging is
    // safe: the provider retrying the same body would only hit the dedupe index.
    log.warn("webhook.apply_failed", { transferId, error });
    await updateWithRetry(execution._id, () => ({ set: { nextCheckAt: new Date() } })).catch(() => null);
    await finish("failed");
    return { duplicate: false, applied: false };
  }
}
