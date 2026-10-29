import "server-only";
import type { ExecutionDTO, RecoveryBundleDTO } from "@/lib/dto";
import type { SessionUser } from "../auth/session";
import type { ExecutionDoc, SignatureRecord } from "../db/types";
import { errors } from "../errors";
import { ProviderAmbiguous } from "../multihopper/http";
import { confirmRecovery, prepareRecovery, type RecoveryKind } from "../multihopper/recovery";
import { providerCode, providerToAppError } from "./provider-errors";
import { syncFromProvider } from "./reconcile";
import { findOwnedExecution, toExecutionDTO, updateWithRetry } from "./repository";

// Getting SOL back out of a transfer: rescue after a failure, rent refund after success.
// The run's state never changes here; recovery is bookkeeping on top of a finished run.
// Eligibility always comes from a fresh provider read, never from what the browser says.

const SIGNATURE_KIND: Record<RecoveryKind, SignatureRecord["kind"]> = { rescue: "rescue", reclaim: "reclaim_rent" };
const LABEL: Record<RecoveryKind, string> = { rescue: "SOL rescue", reclaim: "Rent refund" };

function eligible(doc: ExecutionDoc, kind: RecoveryKind): boolean {
  const r = doc.recovery;
  return Boolean(r && (kind === "rescue" ? r.canRescue : r.canReclaimRent));
}

async function freshOwned(user: SessionUser, id: string): Promise<ExecutionDoc> {
  const doc = await findOwnedExecution(user, id);
  if (!doc.providerTransferId) throw errors.invalidState("This run never reached MultiHopper, so there is nothing to recover.");
  try {
    return await syncFromProvider(doc, "app");
  } catch (error) {
    throw providerToAppError(error);
  }
}

export async function prepareRunRecovery(user: SessionUser, id: string, kind: RecoveryKind): Promise<RecoveryBundleDTO> {
  const doc = await freshOwned(user, id);
  if (!eligible(doc, kind)) {
    throw errors.invalidState(kind === "rescue" ? "MultiHopper reports nothing to rescue for this run." : "There is no rent to refund for this run yet.");
  }
  const attempted = await updateWithRetry(doc._id, () => ({ extra: { $inc: { recoveryAttempts: 1 } } }));
  try {
    const bundle = await prepareRecovery(doc.providerTransferId!, kind, attempted.recoveryAttempts ?? 1);
    if (!bundle.txs.length) throw errors.invalidState("MultiHopper returned no transactions to sign. Recheck the status.");
    return { kind, ...bundle };
  } catch (error) {
    const code = providerCode(error);
    if (code === "MH_080" || code === "MH_081" || code === "MH_082") {
      await syncFromProvider(attempted, "app").catch(() => null);
      throw errors.invalidState("MultiHopper says there is nothing left to recover right now.");
    }
    throw providerToAppError(error);
  }
}

// Signatures are stored before the provider call, so a lost response still leaves a record
// of what the wallet sent and the confirm can be repeated with the same idempotency key.
export async function confirmRunRecovery(user: SessionUser, id: string, kind: RecoveryKind, signatures: string[]): Promise<ExecutionDTO> {
  const doc = await findOwnedExecution(user, id);
  if (!doc.providerTransferId) throw errors.invalidState("This run has no transfer to recover.");
  const signatureKind = SIGNATURE_KIND[kind];
  await updateWithRetry(doc._id, (d) => {
    const fresh: SignatureRecord[] = signatures
      .filter((s) => !d.signatures.some((r) => r.signature === s))
      .map((signature, index) => ({ kind: signatureKind, signature, index, recordedAt: new Date() }));
    if (!fresh.length) return null;
    return { note: `Wallet sent ${fresh.length} ${LABEL[kind].toLowerCase()} transaction${fresh.length > 1 ? "s" : ""}.`, source: "wallet", extra: { $push: { signatures: { $each: fresh } } } };
  });

  let failed: string[];
  try {
    ({ failed } = await confirmRecovery(doc.providerTransferId, kind, signatures));
  } catch (error) {
    if (error instanceof ProviderAmbiguous) throw errors.providerUnavailable(error);
    throw providerToAppError(error);
  }

  const noted = await updateWithRetry(doc._id, () => ({
    note: failed.length
      ? `${LABEL[kind]}: ${failed.length} of ${signatures.length} transactions didn't land. Try again to recover the rest.`
      : `${LABEL[kind]} confirmed by MultiHopper. The SOL is back in your wallet.`,
    source: "provider",
  }));
  const synced = await syncFromProvider(noted, "app").catch(() => noted);
  return toExecutionDTO(synced);
}
