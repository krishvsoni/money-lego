import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import type { ExecutionDTO, PreparedBundleDTO } from "@/lib/dto";
import { totalRaw } from "@/lib/recipe-schema";
import { findToken } from "@/lib/tokens";
import type { SessionUser } from "../auth/session";
import { collections, isDuplicateKeyError } from "../db/collections";
import { inTransaction } from "../db/transaction";
import type { ExecutionDoc, QuoteSnapshot, SignatureKind, SignatureRecord } from "../db/types";
import { errors } from "../errors";
import { ProviderAmbiguous, ProviderRejected } from "../multihopper/http";
import type { Estimate, ProviderTransfer } from "../multihopper/schemas";
import { confirmBroadcast, createTransfer, estimateTransfer, prepareTransfer } from "../multihopper/transfers";
import { getRecipeDoc, parseId } from "../recipes/service";
import { providerCode, providerToAppError } from "./provider-errors";
import { syncFromProvider } from "./reconcile";
import { findOwnedExecution, toExecutionDTO, updateWithRetry } from "./repository";

function quoteFrom(t: ProviderTransfer, estimate: Estimate | null): QuoteSnapshot {
  return {
    amountRaw: t.amountRaw,
    recipientReceivesRaw: t.recipientReceivesRaw,
    percentFeeRaw: t.percentFeeRaw,
    percentFeeBps: t.percentFeeBps,
    totalFlatFeeLamports: t.totalFlatFeeLamports,
    requiredSolUpFrontLamports: estimate?.sol?.requiredSolUpFrontLamports ?? null,
    refundableLamports: estimate?.sol?.refundableLamports ?? null,
    destinationsNet: t.destinations.map((d) => ({ wallet: d.wallet, amountRaw: d.amountRaw })),
    hops: t.hops,
    arrivalSeconds: t.arrivalSeconds,
    pricingTier: t.pricingTier,
    isTest: t.isTest,
    quotedAt: t.quotedAt ? new Date(t.quotedAt) : new Date(),
    expiresAt: t.expiresAt ? new Date(t.expiresAt) : null,
  };
}

// Starts a run: price it, record it, then ask MultiHopper for a binding quote. The client
// sends a requestKey per attempt; a double-click or network retry with the same key gets
// the same run back instead of a second one.
export async function startRun(user: SessionUser, recipeId: string, requestKey: string): Promise<ExecutionDTO> {
  const { executions, recipes } = await collections();
  const recipe = await getRecipeDoc(user, recipeId);

  const existing = await executions.findOne({ ownerId: user.userId, requestKey });
  if (existing) return toExecutionDTO(existing);
  if (recipe.status !== "active") throw errors.invalidState("Restore this recipe before running it.");

  const token = findToken(recipe.config.tokenMint);
  if (!token) throw errors.validation("This recipe's token is not supported on this network. Edit the recipe to pick another.");
  const amountRaw = totalRaw(recipe.config).toString();

  const estimate = await estimateTransfer(recipe.config, token, amountRaw).catch((e) => {
    throw providerToAppError(e);
  });

  const now = new Date();
  const id = new ObjectId();
  const doc: ExecutionDoc = {
    _id: id,
    ownerId: user.userId,
    recipeId: recipe._id,
    recipeVersion: recipe.currentVersion,
    recipeName: recipe.name,
    requestKey,
    externalId: `ml_${id.toHexString()}`,
    sourceWallet: user.wallet,
    snapshot: recipe.config,
    amountRaw,
    state: "quoting",
    providerTransferId: null,
    supportBundleId: null,
    providerStatus: null,
    providerPhase: null,
    progress: null,
    quote: null,
    signatures: [],
    destinations: [],
    timeline: [{ at: now, state: "quoting", note: `Run started from version ${recipe.currentVersion}.`, source: "app" }],
    lastError: null,
    prepareAttempts: 0,
    confirmAttempts: 0,
    shareToken: randomBytes(12).toString("base64url"),
    lease: null,
    nextCheckAt: new Date(now.getTime() + 60_000),
    lastCheckedAt: null,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await inTransaction(async (session) => {
      await executions.insertOne(doc, { session });
      await recipes.updateOne({ _id: recipe._id }, { $inc: { runCount: 1 }, $set: { lastRunAt: now } }, { session });
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const raced = await executions.findOne({ ownerId: user.userId, requestKey });
    if (raced) return toExecutionDTO(raced);
    throw error;
  }

  try {
    const transfer = await createTransfer({ config: recipe.config, token, amountRaw, sourceOwner: user.wallet, externalId: doc.externalId });
    const next = await updateWithRetry(id, () => ({
      to: "quoted",
      note: "MultiHopper returned a quote.",
      source: "provider",
      set: {
        providerTransferId: transfer.id,
        supportBundleId: transfer.supportBundleId,
        providerStatus: transfer.status,
        quote: quoteFrom(transfer, estimate),
        nextCheckAt: new Date(Date.now() + 5 * 60_000),
      },
    }));
    return toExecutionDTO(next);
  } catch (error) {
    if (error instanceof ProviderAmbiguous || providerCode(error) === "MH_033") {
      const next = await updateWithRetry(id, () => ({
        to: "quote_unknown",
        note: "The quote request didn't get a clear answer. Looking it up before anything else.",
        set: { nextCheckAt: new Date() },
      }));
      return toExecutionDTO(await syncFromProvider(next, "app").catch(() => next));
    }
    const appError = providerToAppError(error);
    await updateWithRetry(id, () => ({
      to: "failed",
      note: `${appError.message} No funds moved.`,
      set: { lastError: { code: providerCode(error) ?? appError.code, message: appError.message, at: new Date() }, nextCheckAt: null },
    }));
    throw appError;
  }
}

const PREPARABLE = new Set(["quoted", "signing", "funded", "submitted", "needs_check"]);

export async function prepareRun(user: SessionUser, id: string): Promise<PreparedBundleDTO> {
  const doc = await findOwnedExecution(user, id);
  if (!doc.providerTransferId || !PREPARABLE.has(doc.state)) {
    throw errors.invalidState("This run can't be signed in its current state. Refresh to see where it is.");
  }
  const attempted = await updateWithRetry(doc._id, () => ({ extra: { $inc: { prepareAttempts: 1 } } }));
  try {
    const { preparedTxs: p } = await prepareTransfer(doc.providerTransferId, attempted.prepareAttempts);
    await updateWithRetry(doc._id, (d) =>
      d.state === "quoted" || d.state === "needs_check"
        ? { to: "signing", note: "Transactions prepared. Waiting for your wallet.", source: "app" }
        : null,
    );
    return {
      keeperFundingTx: p.keeperFundingTx,
      routeInitTxs: p.routeInitTxs,
      orchestratorInitTx: p.orchestratorInitTx,
      sessionInitTxs: p.sessionInitTxs,
      dispersionInitTxs: p.dispersionInitTxs,
      lastValidBlockHeight: p.lastValidBlockHeight,
      nothingToDo: p.resume?.nothingToDo ?? false,
    };
  } catch (error) {
    const code = providerCode(error);
    if (code === "MH_034" || code === "MH_035" || code === "MH_040") {
      await syncFromProvider(attempted, "app").catch(() => null);
    }
    throw providerToAppError(error);
  }
}

// Signatures are persisted the moment the wallet broadcasts, before we wait for chain
// confirmation. If the browser closes mid-flow, the run still knows what was sent.
export async function recordSignatures(
  user: SessionUser,
  id: string,
  kind: SignatureKind,
  items: Array<{ signature: string; index: number }>,
): Promise<ExecutionDTO> {
  const doc = await findOwnedExecution(user, id);
  if (!["signing", "funded", "submitted", "needs_check"].includes(doc.state)) {
    throw errors.invalidState("This run isn't waiting for wallet transactions.");
  }
  const next = await updateWithRetry(doc._id, (d) => {
    const fresh: SignatureRecord[] = items
      .filter((i) => !d.signatures.some((s) => s.kind === kind && s.signature === i.signature))
      .map((i) => ({ kind, signature: i.signature, index: i.index, recordedAt: new Date() }));
    if (!fresh.length) return null;
    return {
      note: `Wallet sent ${fresh.length} ${kind.replace(/_/g, " ")} transaction${fresh.length > 1 ? "s" : ""}.`,
      source: "wallet",
      extra: { $push: { signatures: { $each: fresh } } },
    };
  });
  return toExecutionDTO(next);
}

export async function confirmRun(user: SessionUser, id: string, stage: "funding" | "final"): Promise<ExecutionDTO> {
  const doc = await findOwnedExecution(user, id);
  if (!doc.providerTransferId) throw errors.invalidState("This run has no transfer to confirm.");
  if (stage === "funding" && !doc.signatures.some((s) => s.kind === "keeper_funding")) {
    throw errors.invalidState("Send the funding transaction before confirming it.");
  }
  const attempted = await updateWithRetry(doc._id, () => ({ extra: { $inc: { confirmAttempts: 1 } } }));
  try {
    const result = await confirmBroadcast(doc.providerTransferId, stage, attempted.signatures, attempted.confirmAttempts);
    const next = await updateWithRetry(doc._id, (d) => {
      if (stage === "funding") {
        return d.state === "signing" ? { to: "funded", note: "MultiHopper confirmed the funding transaction.", source: "provider" } : null;
      }
      const processing = result.status === "processing" || result.status === "active";
      const to = processing ? "processing" : "submitted";
      if (d.state === to) return { set: { providerStatus: result.status } };
      return {
        to,
        note: processing ? "MultiHopper accepted every transaction. The route is running." : "Transactions sent. Waiting for MultiHopper to start the route.",
        source: "provider",
        set: { providerStatus: result.status, nextCheckAt: new Date(Date.now() + 15_000) },
      };
    });
    return toExecutionDTO(next);
  } catch (error) {
    if (error instanceof ProviderAmbiguous) {
      const next = await updateWithRetry(doc._id, (d) => ({
        to: d.state === "needs_check" ? undefined : "needs_check",
        note: "Confirmation didn't get a clear answer. Checking MultiHopper before doing anything else.",
        set: { nextCheckAt: new Date() },
      }));
      return toExecutionDTO(next);
    }
    if (error instanceof ProviderRejected) {
      const appError = providerToAppError(error);
      await updateWithRetry(doc._id, () => ({ set: { lastError: { code: error.code, message: appError.message, at: new Date() } } }));
      throw appError;
    }
    throw providerToAppError(error);
  }
}

export async function refreshRun(user: SessionUser, id: string): Promise<ExecutionDTO> {
  const doc = await findOwnedExecution(user, id);
  const recentlyChecked = doc.lastCheckedAt && Date.now() - doc.lastCheckedAt.getTime() < 4_000;
  if (recentlyChecked || (!doc.providerTransferId && doc.state !== "quote_unknown")) return toExecutionDTO(doc);
  try {
    return toExecutionDTO(await syncFromProvider(doc, "app"));
  } catch (error) {
    throw providerToAppError(error);
  }
}

export async function listRuns(user: SessionUser, recipeId?: string, limit = 30): Promise<ExecutionDTO[]> {
  const { executions } = await collections();
  const filter = recipeId ? { ownerId: user.userId, recipeId: parseId(recipeId) } : { ownerId: user.userId };
  const docs = await executions.find(filter).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).toArray();
  return docs.map(toExecutionDTO);
}
