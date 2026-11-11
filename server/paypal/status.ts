import "server-only";
import type { SessionUser } from "../auth/session";
import { appUrl, env } from "../config/env";
import { collections } from "../db/collections";
import { isAppError } from "../errors";
import { listWebhooks } from "./api";
import { paypalCapabilities } from "./client";
import { referenceFor } from "@/lib/paypal/types";
import { channel3Configured } from "../integrations/channel3";
import { elasticConfigured } from "../integrations/elastic";

// Read-only views for the PayPal connection page and the payments dashboard. Everything is
// scoped to the signed-in owner; the app's credentials are never returned.

export async function paypalStatus(user: SessionUser) {
  const e = env();
  const configured = Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET);
  const site = appUrl();
  const expectedUrl = `${site}/api/integrations/paypal`;
  let capabilities: Awaited<ReturnType<typeof paypalCapabilities>> | null = null;
  let error: string | null = null;
  let webhook: { id: string; url: string; events: string[]; matchesConfig: boolean } | null = null;
  if (configured) {
    try {
      capabilities = await paypalCapabilities();
      const hooks = (await listWebhooks()).webhooks ?? [];
      const mine = hooks.find((h) => h.id === e.PAYPAL_WEBHOOK_ID) ?? hooks.find((h) => h.url === expectedUrl);
      if (mine) webhook = { id: mine.id, url: mine.url, events: mine.event_types.map((t) => t.name), matchesConfig: mine.id === e.PAYPAL_WEBHOOK_ID };
    } catch (err) {
      error = isAppError(err) ? err.message : "Couldn't reach PayPal.";
    }
  }

  const { workflows, paypalEvents, credentials } = await collections();
  const zapierHooks = await credentials.countDocuments({ ownerId: user.userId, type: "zapier_hook" });
  const mine = await workflows.find({ ownerId: user.userId }, { projection: { _id: 1, webhookKey: 1 } }).toArray();
  const events = await paypalEvents
    .find({ $or: [{ reference: { $in: mine.map((w) => referenceFor(w.webhookKey)) } }, { "routed.workflowId": { $in: mine.map((w) => w._id) } }] })
    .sort({ receivedAt: -1 })
    .limit(20)
    .toArray();

  return {
    configured,
    environment: e.PAYPAL_ENVIRONMENT,
    clientIdHint: e.PAYPAL_CLIENT_ID ? `${e.PAYPAL_CLIENT_ID.slice(0, 6)}…${e.PAYPAL_CLIENT_ID.slice(-4)}` : null,
    appId: capabilities?.appId ?? null,
    features: capabilities?.features ?? null,
    scopeCount: capabilities?.scopes.length ?? 0,
    error,
    webhook: { configuredId: e.PAYPAL_WEBHOOK_ID ?? null, expectedUrl, publicUrl: /^https:\/\//.test(site) && !/localhost|127\.0\.0\.1/.test(site), registered: webhook },
    partners: {
      channel3: channel3Configured(),
      elastic: elasticConfigured(),
      zapier: zapierHooks > 0,
      agGrid: true,
      agent: Boolean(e.OPENROUTER_API_KEY),
    },
    events: events.map((ev) => ({ id: ev._id, eventType: ev.eventType, resourceId: ev.resourceId, outcome: ev.outcome, runs: ev.routed.filter((r) => r.runId).length, summary: ev.summary, receivedAt: ev.receivedAt.toISOString() })),
  };
}

export async function paymentsOverview(user: SessionUser) {
  const { paypalResources, workflowRuns, workflows } = await collections();
  const [resources, runs, flows] = await Promise.all([
    paypalResources.find({ ownerId: user.userId }).sort({ updatedAt: -1 }).limit(500).toArray(),
    workflowRuns.find({ ownerId: user.userId }, { projection: { graph: 0, log: 0 } }).sort({ startedAt: -1 }).limit(200).toArray(),
    workflows.find({ ownerId: user.userId }, { projection: { _id: 1, name: 1 } }).toArray(),
  ]);
  const names = new Map(flows.map((w) => [w._id.toHexString(), w.name]));

  const add = (map: Record<string, string>, currency: string | null, minor: string | null) => {
    if (!currency || !minor) return;
    map[currency] = (BigInt(map[currency] ?? "0") + BigInt(minor)).toString();
  };
  const captured: Record<string, string> = {};
  const refunded: Record<string, string> = {};
  const paidOut: Record<string, string> = {};
  const count = (kind: string, statuses?: string[]) => resources.filter((r) => r.kind === kind && (!statuses || statuses.includes(r.status))).length;
  for (const r of resources) {
    if (r.kind === "capture" && ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(r.status)) add(captured, r.currency, r.amountMinor);
    if (r.kind === "refund" && r.status === "COMPLETED") add(refunded, r.currency, r.amountMinor);
    if (r.kind === "payout_item" && r.status === "SUCCESS") add(paidOut, r.currency, r.amountMinor);
  }
  const settled = runs.filter((r) => r.status === "succeeded" || r.status === "failed");

  return {
    kpis: {
      captured,
      refunded,
      paidOut,
      captures: { completed: count("capture", ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"]), pending: count("capture", ["PENDING"]), denied: count("capture", ["DENIED", "DECLINED", "FAILED"]) },
      payouts: { batches: count("payout_batch"), success: count("payout_batch", ["SUCCESS"]), processing: count("payout_batch", ["PENDING", "PROCESSING", "NEW"]), problems: count("payout_item", ["FAILED", "RETURNED", "BLOCKED", "UNCLAIMED", "DENIED"]) },
      invoices: { total: count("invoice"), paid: count("invoice", ["PAID", "MARKED_AS_PAID"]), reminded: count("invoice", ["REMINDED"]) },
      runs: { total: runs.length, succeeded: runs.filter((r) => r.status === "succeeded").length, failed: runs.filter((r) => r.status === "failed").length, waiting: runs.filter((r) => r.status === "waiting").length, successRate: settled.length ? Math.round((runs.filter((r) => r.status === "succeeded").length / settled.length) * 100) : null },
    },
    resources: resources.map((r) => ({
      id: r._id.toHexString(),
      kind: r.kind,
      paypalId: r.paypalId,
      status: r.status,
      currency: r.currency,
      amountMinor: r.amountMinor,
      counterparty: r.counterparty,
      workflowId: r.workflowId?.toHexString() ?? null,
      workflowName: r.workflowId ? (names.get(r.workflowId.toHexString()) ?? "Deleted workflow") : null,
      runId: r.runId?.toHexString() ?? null,
      environment: r.environment,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    runs: runs.slice(0, 100).map((r) => ({
      id: r._id.toHexString(),
      workflowId: r.workflowId.toHexString(),
      workflowName: r.workflowName,
      status: r.status,
      trigger: r.trigger.type,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  };
}

export type PaymentsOverview = Awaited<ReturnType<typeof paymentsOverview>>;
export type PaypalStatus = Awaited<ReturnType<typeof paypalStatus>>;
