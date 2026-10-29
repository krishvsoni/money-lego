import "server-only";
import { providerRequest } from "./http";
import { reclaimBundleSchema, reclaimConfirmSchema, rescueBundleSchema } from "./schemas";
import { idempotencyKey } from "./transfers";

// Recovery returns SOL to the transfer's sourceOwner. Rescue drains accounts of a failed or
// stuck route; reclaim closes step accounts after a completed one. MultiHopper builds the
// transactions, the source wallet signs them in the browser, and we report the signatures.

export type RecoveryKind = "rescue" | "reclaim";

export interface RecoveryBundle {
  txs: string[];
  lastValidBlockHeight: number | null;
  totalLamports: number;
}

const PATHS: Record<RecoveryKind, string> = { rescue: "rescue", reclaim: "reclaim-rent" };

export async function prepareRecovery(transferId: number, kind: RecoveryKind, attempt: number): Promise<RecoveryBundle> {
  const json = await providerRequest("POST", `/transfers/${transferId}/${PATHS[kind]}/prepare`, {
    idempotencyKey: idempotencyKey(kind, "prepare", transferId, attempt),
  });
  if (kind === "rescue") {
    const b = rescueBundleSchema.parse(json);
    return { txs: b.rescueTxs, lastValidBlockHeight: b.lastValidBlockHeight, totalLamports: b.rescuable?.totalLamports ?? 0 };
  }
  const b = reclaimBundleSchema.parse(json);
  return { txs: b.reclaimTxs, lastValidBlockHeight: b.lastValidBlockHeight, totalLamports: b.reclaimable?.totalLamports ?? 0 };
}

// Rescue answers with the updated transfer; reclaim lists which signatures landed.
export async function confirmRecovery(transferId: number, kind: RecoveryKind, signatures: string[]): Promise<{ failed: string[] }> {
  const body = kind === "rescue" ? { rescueSignatures: signatures } : { reclaimSignatures: signatures };
  const json = await providerRequest("POST", `/transfers/${transferId}/${PATHS[kind]}/confirm`, {
    body,
    idempotencyKey: idempotencyKey(kind, "confirm", transferId, ...signatures),
    retries: 1,
  });
  if (kind === "rescue") return { failed: [] };
  return { failed: reclaimConfirmSchema.parse(json).failed.map((f) => f.signature) };
}
