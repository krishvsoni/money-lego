import "server-only";
import { ObjectId } from "mongodb";
import { fromRaw, sumRaw, toRaw } from "@/lib/amounts";
import type { ExecutionState } from "@/lib/execution-states";
import { MAX_DESTINATIONS } from "@/lib/recipe-schema";
import { isSolanaAddress } from "@/lib/solana-address";
import { findToken } from "@/lib/tokens";
import { collections, isDuplicateKeyError } from "../../db/collections";
import { asObject, NodeError, ok, type Executor } from "../types";

export interface PayoutOptions {
  tokenMint: string;
  walletField: string;
  amountField: string;
  labelField?: string;
  expectedTotal?: string;
  maxTotal?: string;
}

const field = (row: Record<string, unknown>, key: string) => String(row[key] ?? "").trim();

// Pure so the rules can be tested without a database. Every failure names the row, so the
// operator can fix the source record and retry.
export function buildPayout(rowsValue: unknown, o: PayoutOptions) {
  const token = findToken(o.tokenMint);
  if (!token) throw new NodeError("This token isn't supported on this network.");
  if (!Array.isArray(rowsValue)) throw new NodeError("Records must be a list. Point this at the rows or records from the previous step.");
  const rows = rowsValue.map((r) => asObject(r));
  if (rows.length === 0) throw new NodeError("No approved records to pay. Nothing was sent.");
  if (rows.length > MAX_DESTINATIONS) {
    throw new NodeError(`${rows.length} recipients is more than the ${MAX_DESTINATIONS} one MultiHopper transfer can pay. Split the batch into separately reviewed runs; nothing was split automatically.`);
  }

  const seen = new Set<string>();
  const destinations = rows.map((row, i) => {
    const n = i + 1;
    const wallet = field(row, o.walletField);
    if (!wallet) throw new NodeError(`Record ${n} has no ${o.walletField}.`);
    if (!isSolanaAddress(wallet)) throw new NodeError(`Record ${n}: ${o.walletField} isn't a valid Solana address.`);
    if (seen.has(wallet)) throw new NodeError(`Record ${n} pays the same wallet as an earlier record. Merge them in the source first.`);
    seen.add(wallet);
    const amount = field(row, o.amountField);
    let raw: bigint;
    try {
      raw = toRaw(amount, token.decimals);
    } catch {
      throw new NodeError(`Record ${n}: ${o.amountField} "${amount.slice(0, 40)}" isn't a ${token.symbol} amount with at most ${token.decimals} decimals.`);
    }
    if (raw <= 0n) throw new NodeError(`Record ${n}: ${o.amountField} must be more than zero.`);
    return { wallet, amountRaw: raw.toString(), label: o.labelField ? field(row, o.labelField).slice(0, 60) : "" };
  });

  const total = sumRaw(destinations.map((d) => d.amountRaw));
  const limit = (value: string | undefined, what: string) => {
    if (!value || !value.trim()) return null;
    try {
      return toRaw(value.trim(), token.decimals);
    } catch {
      throw new NodeError(`${what} "${value.slice(0, 40)}" isn't a valid ${token.symbol} amount.`);
    }
  };
  const expected = limit(o.expectedTotal, "Exact total");
  if (expected !== null && expected !== total) {
    throw new NodeError(`The amounts add up to ${fromRaw(total, token.decimals)} ${token.symbol}, not the expected ${fromRaw(expected, token.decimals)}. Nothing was adjusted.`);
  }
  const cap = limit(o.maxTotal, "Spending cap");
  if (cap !== null && total > cap) {
    throw new NodeError(`This payout is ${fromRaw(total, token.decimals)} ${token.symbol}, above the ${fromRaw(cap, token.decimals)} cap.`);
  }
  return { tokenMint: token.mint, symbol: token.symbol, decimals: token.decimals, amountRaw: total.toString(), amount: fromRaw(total, token.decimals), destinations };
}

// States in which no funds can have left the payer, so a failed run's key may be reused.
const NOTHING_MOVED: ExecutionState[] = ["quoted", "expired"];

const once: Executor = async ({ config, input, run }) => {
  const key = String(config.key ?? "").trim();
  if (!key || key.length > 200 || /\{\{|\bundefined\b|\bnull\b|:$|::/.test(key)) throw new NodeError("The key didn't resolve to a value. Check the expression points at an ID.");
  const { onceKeys, workflowRuns, executions } = await collections();
  const claim = { workflowId: run.workflowId, key, runId: run._id, claimedAt: new Date() };
  try {
    await onceKeys.insertOne({ _id: new ObjectId(), ...claim });
    return ok({ ...asObject(input), onceKey: key });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  const existing = await onceKeys.findOne({ workflowId: run.workflowId, key });
  if (!existing) throw new NodeError("Couldn't claim this key. Retry the run.");
  if (existing.runId.equals(run._id)) return ok({ ...asObject(input), onceKey: key });

  const previous = await workflowRuns.findOne({ _id: existing.runId }, { projection: { status: 1 } });
  const ended = !previous || previous.status === "failed" || previous.status === "cancelled";
  const moved = await executions.countDocuments({ "source.workflowRunId": existing.runId, state: { $nin: NOTHING_MOVED } }, { limit: 1 });
  if (ended && !moved) {
    // Compare-and-set on the old holder, so two retries racing for the key can't both win.
    const taken = await onceKeys.findOneAndUpdate({ _id: existing._id, runId: existing.runId }, { $set: { runId: run._id, claimedAt: new Date() } });
    if (taken) return ok({ ...asObject(input), onceKey: key });
  }
  throw new NodeError(`"${key}" was already handled by run ${existing.runId.toHexString()}, so this run stopped. Nothing was sent.`);
};

export const payoutExecutors: Record<string, Executor> = {
  "data.payout_rows": async ({ config }) =>
    ok(
      buildPayout(config.rows, {
        tokenMint: String(config.tokenMint ?? ""),
        walletField: String(config.walletField ?? "wallet"),
        amountField: String(config.amountField ?? "amount"),
        labelField: config.labelField ? String(config.labelField) : undefined,
        expectedTotal: config.expectedTotal === undefined ? undefined : String(config.expectedTotal),
        maxTotal: config.maxTotal === undefined ? undefined : String(config.maxTotal),
      }),
    ),
  "logic.once": once,
};
