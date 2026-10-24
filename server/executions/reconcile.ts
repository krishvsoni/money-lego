import "server-only";
import { isTerminal, reconcileState, STATE_META, type ExecutionState } from "@/lib/execution-states";
import { collections } from "../db/collections";
import { INSTANCE_ID } from "../db/locks";
import type { DestinationOutcome, ExecutionDoc, TimelineEvent } from "../db/types";
import { log } from "../log";
import { ProviderRejected } from "../multihopper/http";
import type { ProviderTransfer } from "../multihopper/schemas";
import { getTransfer, getTransferByExternalId } from "../multihopper/transfers";
import { updateWithRetry } from "./repository";

// Pulls MultiHopper's view of a run and folds it into ours. Webhooks, the user's refresh
// button and the background reconciler all funnel through here, so there is exactly one
// place that decides what a provider status means.

const LEASE_MS = 60_000;

function nextCheckDelayMs(state: ExecutionState): number | null {
  if (isTerminal(state)) return null;
  if (state === "quoted") return 5 * 60_000;
  if (state === "processing") return 30_000;
  return 15_000;
}

function destinationsFrom(t: ProviderTransfer): DestinationOutcome[] {
  return t.destinations.map((d) => ({
    wallet: d.wallet,
    amountRaw: d.amountRaw,
    status: d.status === "paid" ? "paid" : "pending",
    payoutSignature: d.payoutSignature,
    paidAt: d.paidAt ? new Date(d.paidAt) : null,
  }));
}

export function applyProviderTransfer(doc: ExecutionDoc, t: ProviderTransfer, source: TimelineEvent["source"]) {
  const to = reconcileState(doc.state, t.status);
  const delay = nextCheckDelayMs(to);
  const now = new Date();
  return {
    to,
    note: to !== doc.state ? `MultiHopper reports ${t.status}${t.phase ? ` (${t.phase})` : ""}.` : undefined,
    source,
    set: {
      providerTransferId: t.id,
      supportBundleId: t.supportBundleId ?? doc.supportBundleId,
      providerStatus: t.status,
      providerPhase: t.phase,
      progress: t.progress,
      destinations: t.destinations.length ? destinationsFrom(t) : doc.destinations,
      lastError: t.lastError ? { code: t.lastError.code, message: t.lastError.message, at: now } : doc.lastError,
      lastCheckedAt: now,
      nextCheckAt: delay === null ? null : new Date(now.getTime() + delay),
      lease: null,
    },
  };
}

export async function syncFromProvider(doc: ExecutionDoc, source: TimelineEvent["source"]): Promise<ExecutionDoc> {
  let transfer: ProviderTransfer;
  try {
    transfer = doc.providerTransferId
      ? await getTransfer(doc.providerTransferId)
      : await getTransferByExternalId(doc.externalId);
  } catch (error) {
    // A definite "not found" for a quote that never got an answer means it was never
    // created, so no funds can have moved and the run can close safely.
    if (error instanceof ProviderRejected && error.code === "MH_030" && doc.state === "quote_unknown") {
      return updateWithRetry(doc._id, (d) =>
        d.state === "quote_unknown"
          ? { to: "failed", note: "MultiHopper never created this quote. No funds moved.", source, set: { nextCheckAt: null, lease: null } }
          : null,
      );
    }
    await updateWithRetry(doc._id, () => ({
      set: { lastCheckedAt: new Date(), nextCheckAt: new Date(Date.now() + 60_000), lease: null },
    }));
    throw error;
  }
  return updateWithRetry(doc._id, (fresh) => applyProviderTransfer(fresh, transfer, source));
}

// Claims due runs one at a time with a lease, so several reconciler instances running at
// once each take different runs. A crashed worker's lease expires and the run is retried.
export async function reconcileDue(limit = 25): Promise<{ checked: number; failed: number }> {
  const { executions } = await collections();
  let checked = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const claimed = await executions.findOneAndUpdate(
      {
        nextCheckAt: { $lte: now },
        state: { $nin: Object.keys(STATE_META).filter((s) => STATE_META[s as ExecutionState].terminal) as ExecutionState[] },
        $or: [{ lease: null }, { "lease.expiresAt": { $lte: now } }],
      },
      { $set: { lease: { owner: INSTANCE_ID, expiresAt: new Date(now.getTime() + LEASE_MS) } } },
      { sort: { nextCheckAt: 1 }, returnDocument: "after" },
    );
    if (!claimed) break;
    try {
      await syncFromProvider(claimed, "reconciler");
      checked++;
    } catch (error) {
      failed++;
      log.warn("reconcile.failed", { executionId: claimed._id.toHexString(), error });
    }
  }
  return { checked, failed };
}
