import "server-only";
import type { ReceiptDTO } from "@/lib/dto";
import { collections } from "../db/collections";
import { errors } from "../errors";

// A receipt is reachable by an unguessable share token and exposes only on-chain facts.
// Private recipient labels, the owner account and provider internals stay out.

export async function getReceipt(shareToken: string): Promise<ReceiptDTO> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(shareToken)) throw errors.notFound("Receipt");
  const { executions } = await collections();
  const doc = await executions.findOne({ shareToken });
  if (!doc) throw errors.notFound("Receipt");

  const delivered = doc.destinations.length
    ? doc.destinations.map((d) => ({ wallet: d.wallet, amountRaw: d.amountRaw, status: d.status, payoutSignature: d.payoutSignature }))
    : doc.snapshot.destinations.map((d) => ({ wallet: d.wallet, amountRaw: d.amountRaw, status: "pending", payoutSignature: null }));

  const completed = doc.timeline.find((e) => e.state === "completed");
  return {
    recipeName: doc.recipeName,
    state: doc.state,
    tokenMint: doc.snapshot.tokenMint,
    amountRaw: doc.amountRaw,
    recipientReceivesRaw: doc.quote?.recipientReceivesRaw ?? null,
    supportBundleId: doc.supportBundleId,
    destinations: delivered,
    signatures: doc.signatures.map((s) => ({ kind: s.kind, signature: s.signature })),
    createdAt: doc.createdAt.toISOString(),
    completedAt: completed ? completed.at.toISOString() : null,
  };
}
