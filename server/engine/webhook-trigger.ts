import "server-only";
import { createHash } from "node:crypto";
import { collections } from "../db/collections";
import { errors } from "../errors";
import { log } from "../log";
import { hookSecret } from "../workflows/activation";
import { readCredentialSecret } from "../workflows/credentials";
import { advanceRun } from "./advance";
import { verifyGithub } from "./inbound/providers";
import { hmacMatches, InboundRejected, parseJsonBody, type InboundDecision, type InboundRequest } from "./inbound/types";
import { createRun } from "./runs";

// Per-workflow endpoints, addressed by an unguessable key: our generic signed webhook, and
// GitHub repository webhooks registered when the workflow was turned on (signed with a
// secret only that workflow holds). A verified delivery proves who sent it, never that a
// payment is owed; its delivery key makes redeliveries return the original run.

// Our own scheme: x-money-lego-signature: sha256=<hex HMAC of the raw body>.
function verifyGeneric({ raw, headers, secret }: InboundRequest): InboundDecision {
  const given = headers.get("x-money-lego-signature")?.trim().replace(/^sha256=/i, "").toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(given) || !hmacMatches(secret, raw, given, "hex")) throw new InboundRejected("Signature mismatch.");
  const body = parseJsonBody(raw);
  const header = headers.get("idempotency-key");
  const deliveryId = header && /^[A-Za-z0-9._:-]{8,100}$/.test(header) ? header : createHash("sha256").update(raw).digest("hex");
  return { kind: "run", key: `webhook:${deliveryId}`, payload: { body, receivedAt: new Date().toISOString(), deliveryId } };
}

export interface InboundResult {
  status: number;
  body: unknown;
}

export async function receiveTriggerWebhook(key: string, raw: Buffer, headers: Headers): Promise<InboundResult> {
  if (!/^[A-Za-z0-9_-]{24}$/.test(key)) throw errors.notFound("Webhook");
  const { workflows } = await collections();
  const workflow = await workflows.findOne({ webhookKey: key, status: "active" });
  const trigger = workflow?.graph.nodes.find((n) => n.type === "trigger.webhook" || n.type === "trigger.github");
  // Unknown, archived and non-webhook workflows all look the same from outside.
  if (!workflow || !trigger) throw errors.notFound("Webhook");

  let decision: InboundDecision;
  try {
    const secret = trigger.type === "trigger.github" ? hookSecret(workflow) : await readCredentialSecret(workflow.ownerId, trigger.config.credentialId, "webhook_secret").catch(() => null);
    if (!secret) throw new InboundRejected("No secret.");
    const request = { raw, headers, config: trigger.config, secret, nowMs: Date.now() };
    decision = trigger.type === "trigger.github" ? verifyGithub(request) : verifyGeneric(request);
  } catch (error) {
    if (!(error instanceof InboundRejected)) throw error;
    log.warn("trigger_webhook.rejected", { workflowId: workflow._id.toHexString(), trigger: trigger.type, reason: error.message });
    // A disabled workflow answers like an unknown one, so probing reveals nothing.
    throw workflow.enabled ? errors.forbidden() : errors.notFound("Webhook");
  }

  if (decision.kind === "handshake") return { status: 200, body: decision.reply };
  if (!workflow.enabled) throw errors.notFound("Webhook");
  if (decision.kind === "ignore") return { status: 200, body: { ignored: true, reason: decision.reason } };
  const { run, created } = await createRun(workflow, { type: trigger.type, key: decision.key, payload: decision.payload });
  if (created) await advanceRun(run._id, 5_000);
  return { status: created ? 202 : 200, body: { runId: run._id.toHexString(), duplicate: !created } };
}
