import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { collections } from "../db/collections";
import { errors } from "../errors";
import { log } from "../log";
import { readCredentialSecret } from "../workflows/credentials";
import { advanceRun } from "./advance";
import { createRun } from "./runs";

// Inbound webhook trigger. The sender proves it holds the signing secret by sending
// x-money-lego-signature: sha256=<hex HMAC of the raw body>. A verified webhook only proves
// who sent the event; it isn't evidence that a payment happened.

function signatureValid(raw: Buffer, header: string | null, secret: string): boolean {
  const given = header?.trim().replace(/^sha256=/i, "").toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function receiveTriggerWebhook(key: string, raw: Buffer, headers: Headers) {
  if (!/^[A-Za-z0-9_-]{24}$/.test(key)) throw errors.notFound("Webhook");
  const { workflows } = await collections();
  const workflow = await workflows.findOne({ webhookKey: key, status: "active" });
  const trigger = workflow?.graph.nodes.find((n) => n.type === "trigger.webhook");
  // Unknown, disabled and non-webhook workflows all look the same from outside.
  if (!workflow || !workflow.enabled || !trigger) throw errors.notFound("Webhook");

  const secret = await readCredentialSecret(workflow.ownerId, trigger.config.credentialId, "webhook_secret").catch(() => null);
  if (!secret || !signatureValid(raw, headers.get("x-money-lego-signature"), secret)) {
    log.warn("trigger_webhook.bad_signature", { workflowId: workflow._id.toHexString() });
    throw errors.forbidden();
  }

  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    throw errors.validation("The webhook body must be JSON.");
  }

  const given = headers.get("idempotency-key");
  const deliveryId = given && /^[A-Za-z0-9._:-]{8,100}$/.test(given) ? given : createHash("sha256").update(raw).digest("hex");
  const { run, created } = await createRun(workflow, {
    type: "trigger.webhook",
    key: `webhook:${deliveryId}`,
    payload: { body, receivedAt: new Date().toISOString(), deliveryId },
  });
  if (created) await advanceRun(run._id, 5_000);
  return { runId: run._id.toHexString(), duplicate: !created };
}
