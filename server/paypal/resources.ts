import "server-only";
import { ObjectId } from "mongodb";
import { toMinor, type PaypalResourceKind } from "@/lib/paypal/types";
import { env } from "../config/env";
import { collections } from "../db/collections";
import { log } from "../log";
import type { Money } from "./api";

// Upserts the local mirror of a PayPal object. Called by nodes after a PayPal call and by
// the webhook receiver when PayPal reports a change, so the dashboard reflects both.

export interface ResourceUpdate {
  kind: PaypalResourceKind;
  paypalId: string;
  status: string;
  amount?: Money | null;
  counterparty?: string | null;
  detail?: Record<string, unknown>;
  owner?: { ownerId: ObjectId; workflowId: ObjectId | null; runId: ObjectId | null; nodeId: string | null } | null;
}

export function minorOf(m: Money | null | undefined): string | null {
  if (!m?.value) return null;
  try {
    return toMinor(m.value).toString();
  } catch {
    return null;
  }
}

export async function recordResource(u: ResourceUpdate): Promise<void> {
  const { paypalResources } = await collections();
  const now = new Date();
  const set: Record<string, unknown> = { status: u.status, updatedAt: now };
  if (u.amount) {
    set.currency = u.amount.currency_code;
    set.amountMinor = minorOf(u.amount);
  }
  if (u.counterparty) set.counterparty = u.counterparty.slice(0, 200);
  for (const [k, v] of Object.entries(u.detail ?? {})) set[`detail.${k}`] = v;
  if (u.owner) Object.assign(set, { ownerId: u.owner.ownerId, workflowId: u.owner.workflowId, runId: u.owner.runId, nodeId: u.owner.nodeId });
  try {
    await paypalResources.updateOne(
      { kind: u.kind, paypalId: u.paypalId },
      {
        $set: set,
        $setOnInsert: {
          _id: new ObjectId(),
          ...(u.owner ? {} : { ownerId: null, workflowId: null, runId: null, nodeId: null }),
          ...(u.amount ? {} : { currency: null, amountMinor: null }),
          ...(u.counterparty ? {} : { counterparty: null }),
          ...(u.detail && Object.keys(u.detail).length ? {} : { detail: {} }),
          environment: env().PAYPAL_ENVIRONMENT,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // The mirror is for display; a write failure must never fail the PayPal action itself.
    log.warn("paypal.resource_write_failed", { kind: u.kind, error: error instanceof Error ? error.message : "unknown" });
  }
}

// Masks an email for logs, run data shown to others, and AI prompts: a***@example.com.
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}
