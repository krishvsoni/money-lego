import "server-only";
import { ObjectId } from "mongodb";
import { formatAmount } from "@/lib/amounts";
import { STATE_META, type ExecutionState } from "@/lib/execution-states";
import { recipeConfigSchema, type RecipeConfig } from "@/lib/recipe-schema";
import { findToken } from "@/lib/tokens";
import { env } from "../../config/env";
import { collections } from "../../db/collections";
import type { ExecutionDoc } from "../../db/types";
import { isAppError } from "../../errors";
import { providerToAppError } from "../../executions/provider-errors";
import { quoteTransfer } from "../../executions/service";
import { estimateTransfer } from "../../multihopper/transfers";
import { payoutHash } from "../payload-hash";
import { asObject, NodeError, ok, type ExecContext, type Executor } from "../types";

// MultiHopper nodes. They read the allocation produced by Split allocation (or any node
// that outputs { tokenMint, destinations }) and reuse the transfer service, so quotes,
// signing and reconciliation behave exactly as they do everywhere else in the app.

function allocation(ctx: ExecContext): RecipeConfig {
  const input = asObject(ctx.input);
  const route: RecipeConfig["route"] = { mode: "standard" };
  if (ctx.config.hops !== undefined && ctx.config.hops !== "") route.hops = Number(ctx.config.hops);
  if (ctx.config.arrivalSeconds !== undefined && ctx.config.arrivalSeconds !== "") route.arrivalSeconds = Number(ctx.config.arrivalSeconds);
  const parsed = recipeConfigSchema.safeParse({ tokenMint: input.tokenMint, destinations: input.destinations, route });
  if (!parsed.success) {
    throw new NodeError(`This node needs an allocation from Split allocation. ${parsed.error.issues[0]?.message ?? ""}`.trim());
  }
  return parsed.data;
}

function rethrow(error: unknown): never {
  const app = isAppError(error) ? error : providerToAppError(error);
  throw new NodeError(app.message);
}

async function transferOf(ctx: ExecContext): Promise<ExecutionDoc> {
  const id = asObject(ctx.input).transferRunId;
  if (typeof id !== "string" || !ObjectId.isValid(id)) throw new NodeError("No transfer to follow. Connect this after MultiHopper create transfer.");
  const { executions } = await collections();
  const doc = await executions.findOne({ _id: new ObjectId(id), ownerId: ctx.ownerId });
  if (!doc) throw new NodeError("The transfer for this run no longer exists.");
  return doc;
}

const FAILED: ExecutionState[] = ["failed", "expired", "refunded"];

function waitFor(ctx: ExecContext, doc: ExecutionDoc, reached: boolean, kind: "wallet" | "transfer", hours: number) {
  if (FAILED.includes(doc.state)) {
    const failure = `The transfer ${STATE_META[doc.state].label.toLowerCase()}. ${doc.lastError?.message ?? STATE_META[doc.state].help}`;
    // A connected Failed branch turns the failure into data for a notification; without
    // one, the run fails loudly as before.
    const handled = kind === "transfer" && ctx.run.graph.edges.some((e) => e.source === ctx.node.id && e.sourcePort === "failed");
    if (handled) return ok({ ...asObject(ctx.input), state: doc.state, providerStatus: doc.providerStatus, failure }, "failed");
    throw new NodeError(failure);
  }
  if (reached) return ok({ ...asObject(ctx.input), state: doc.state, providerStatus: doc.providerStatus, destinations: doc.destinations.length ? doc.destinations : asObject(ctx.input).destinations });
  const until = ctx.waitState?.until ? new Date(String(ctx.waitState.until)) : new Date(Date.now() + hours * 3_600_000);
  if (until.getTime() <= Date.now()) {
    throw new NodeError(kind === "wallet" ? "Nobody signed in time. The quote will expire unfunded; no funds moved." : "The transfer didn't reach the expected state in time. Check it on the transfer page.");
  }
  return { kind: "wait" as const, wait: { kind, until, ref: doc._id.toHexString() }, state: { until: until.toISOString() } };
}

export const moneyExecutors: Record<string, Executor> = {
  "mh.estimate": async (ctx) => {
    const config = allocation(ctx);
    const token = findToken(config.tokenMint)!;
    const amountRaw = config.destinations.reduce((acc, d) => acc + BigInt(d.amountRaw), 0n).toString();
    const estimate = await estimateTransfer(config, token, amountRaw).catch(rethrow);
    return ok({
      ...asObject(ctx.input),
      estimate: {
        percentFeeRaw: estimate.percentFeeRaw,
        percentFeeBps: estimate.percentFeeBps ?? null,
        netDeliveredRaw: estimate.hopAmountRaw ?? null,
        totalFlatFeeLamports: estimate.totalFlatFeeLamports ?? null,
        requiredSolUpFrontLamports: estimate.sol?.requiredSolUpFrontLamports ?? null,
        isTest: estimate.isTestMode ?? null,
      },
    });
  },

  "mh.create_transfer": async (ctx) => {
    const config = allocation(ctx);
    const approved = asObject(asObject(ctx.input).approval).payloadHash;
    if (typeof approved === "string" && approved !== payoutHash(ctx.input)) {
      throw new NodeError("This payout differs from the one that was approved, so no quote was created. Nothing was sent.");
    }
    const doc = await quoteTransfer({
      ownerId: ctx.ownerId,
      sourceWallet: ctx.ownerWallet,
      config,
      requestKey: `wf-${ctx.run._id.toHexString()}-${ctx.node.id}`,
      label: ctx.run.workflowName,
      source: { workflowId: ctx.run.workflowId, workflowRunId: ctx.run._id, nodeId: ctx.node.id },
    }).catch(rethrow);
    if (doc.state === "failed") throw new NodeError(doc.lastError?.message ?? "MultiHopper declined the quote. No funds moved.");
    return ok({
      ...asObject(ctx.input),
      transferRunId: doc._id.toHexString(),
      providerTransferId: doc.providerTransferId,
      quote: doc.quote ? { recipientReceivesRaw: doc.quote.recipientReceivesRaw, percentFeeRaw: doc.quote.percentFeeRaw, requiredSolUpFrontLamports: doc.quote.requiredSolUpFrontLamports } : null,
      expiresAt: doc.quote?.expiresAt?.toISOString() ?? null,
      state: doc.state,
    });
  },

  "mh.wallet_sign": async (ctx) => {
    const doc = await transferOf(ctx);
    const signed = ["processing", "completed"].includes(doc.state);
    return waitFor(ctx, doc, signed, "wallet", Number(ctx.config.timeoutHours ?? 24));
  },

  "mh.wait_status": async (ctx) => {
    const doc = await transferOf(ctx);
    const reached = ctx.config.target === "processing" ? ["processing", "completed"].includes(doc.state) : doc.state === "completed";
    return waitFor(ctx, doc, reached, "transfer", Number(ctx.config.timeoutHours ?? 72));
  },

  "mh.result": async (ctx) => {
    const doc = await transferOf(ctx);
    const token = findToken(doc.snapshot.tokenMint);
    return ok({
      state: doc.state,
      amount: token ? `${formatAmount(doc.amountRaw, token.decimals)} ${token.symbol}` : doc.amountRaw,
      token: token?.symbol ?? doc.snapshot.tokenMint,
      recipients: doc.snapshot.destinations.length,
      paid: doc.destinations.filter((d) => d.status === "paid").length,
      receiptUrl: `${env().APP_URL}/receipts/${doc.shareToken}`,
      signatures: doc.signatures.map((s) => s.signature),
      transferRunId: doc._id.toHexString(),
    });
  },
};
