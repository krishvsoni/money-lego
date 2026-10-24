import "server-only";
import { fromRaw, splitByPercent, splitEvenly, sumRaw, toRaw } from "@/lib/amounts";
import { MAX_DESTINATIONS } from "@/lib/recipe-schema";
import { isSolanaAddress } from "@/lib/solana-address";
import { findToken } from "@/lib/tokens";
import { getPath } from "@/lib/workflow/expressions";
import { asObject, NodeError, ok, type ExecContext, type ExecResult, type Executor } from "../types";

function parseJson(value: unknown, label: string): unknown {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new NodeError(`${label} isn't valid JSON.`);
  }
}

export function compare(left: unknown, operator: unknown, right: unknown): boolean {
  if (operator === "exists") return left !== undefined && left !== null && left !== "";
  const ln = Number(left);
  const rn = Number(right);
  const numeric = left !== "" && right !== "" && Number.isFinite(ln) && Number.isFinite(rn) && typeof left !== "boolean";
  switch (operator) {
    case "equals":
      return numeric ? ln === rn : String(left ?? "") === String(right ?? "");
    case "notEquals":
      return numeric ? ln !== rn : String(left ?? "") !== String(right ?? "");
    case "gt":
      return numeric && ln > rn;
    case "gte":
      return numeric && ln >= rn;
    case "lt":
      return numeric && ln < rn;
    case "lte":
      return numeric && ln <= rn;
    case "contains":
      return Array.isArray(left) ? left.map(String).includes(String(right)) : String(left ?? "").includes(String(right ?? ""));
    default:
      throw new NodeError("Unknown operator.");
  }
}

function typeMatches(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string" && value.length > 0;
    case "number":
      return typeof value === "number" ? Number.isFinite(value) : false;
    case "boolean":
      return typeof value === "boolean";
    case "address":
      return typeof value === "string" && isSolanaAddress(value);
    case "object":
      return !!value && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    default:
      return false;
  }
}

const split: Executor = async ({ config }) => {
  const token = findToken(String(config.tokenMint ?? ""));
  if (!token) throw new NodeError("This token isn't supported on this network.");
  const rows = (Array.isArray(config.recipients) ? config.recipients : []) as Array<Record<string, unknown>>;
  if (!rows.length || rows.length > MAX_DESTINATIONS) throw new NodeError(`Use between 1 and ${MAX_DESTINATIONS} recipients.`);
  const wallets = rows.map((r) => String(r.wallet ?? "").trim());
  wallets.forEach((w, i) => {
    if (!isSolanaAddress(w)) throw new NodeError(`Recipient ${i + 1} isn't a valid Solana address.`);
    if (wallets.indexOf(w) !== i) throw new NodeError(`Recipient ${i + 1} repeats an earlier wallet.`);
  });

  const toTokenRaw = (value: unknown, what: string) => {
    try {
      return toRaw(String(value ?? ""), token.decimals);
    } catch (e) {
      throw new NodeError(`${what}: ${(e as Error).message}`);
    }
  };

  let amounts: bigint[];
  if (config.mode === "fixed") {
    amounts = rows.map((r, i) => toTokenRaw(r.share, `Recipient ${i + 1}`));
  } else {
    const total = toTokenRaw(config.total, "Total amount");
    if (config.mode === "even") amounts = splitEvenly(total, rows.length);
    else {
      const hundredths = rows.map((r, i) => {
        const v = String(r.share ?? "").trim();
        if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new NodeError(`Recipient ${i + 1}: use a percentage with up to 2 decimals.`);
        return Math.round(Number(v) * 100);
      });
      if (hundredths.reduce((a, b) => a + b, 0) !== 10_000) throw new NodeError("Percentages must add up to 100.");
      amounts = splitByPercent(total, hundredths);
    }
  }
  const zero = amounts.findIndex((a) => a <= 0n);
  if (zero >= 0) throw new NodeError(`Recipient ${zero + 1} would receive nothing. Raise the total or their share.`);

  const amountRaw = sumRaw(amounts);
  return ok({
    tokenMint: token.mint,
    symbol: token.symbol,
    decimals: token.decimals,
    amountRaw: amountRaw.toString(),
    amount: fromRaw(amountRaw, token.decimals),
    destinations: amounts.map((a, i) => ({ wallet: wallets[i], amountRaw: a.toString(), label: String(rows[i].label ?? "") })),
  });
};

const approval: Executor = async ({ config, input, waitState }) => {
  const decision = waitState?.decision as string | undefined;
  if (decision === "approved" || decision === "rejected") {
    return ok({ ...asObject(input), approval: { decision, by: waitState?.by ?? null, at: waitState?.at ?? null } }, decision);
  }
  const until = waitState?.until ? new Date(String(waitState.until)) : new Date(Date.now() + Number(config.timeoutHours ?? 24) * 3_600_000);
  if (until.getTime() <= Date.now()) throw new NodeError("Nobody approved this in time, so the run stopped. Nothing was sent.");
  return { kind: "wait", wait: { kind: "approval", until, ref: null }, state: { until: until.toISOString(), message: String(config.message ?? "") } };
};

const delay: Executor = async ({ config, input, waitState }) => {
  const until = waitState?.until ? new Date(String(waitState.until)) : new Date(Date.now() + Number(config.minutes ?? 1) * 60_000);
  if (until.getTime() <= Date.now()) return ok(input);
  return { kind: "wait", wait: { kind: "delay", until, ref: null }, state: { until: until.toISOString() } };
};

export const coreExecutors: Record<string, Executor> = {
  "trigger.manual": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.webhook": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.schedule": async ({ run }) => ok(run.trigger.payload ?? {}),
  "logic.condition": async ({ config, input }: ExecContext): Promise<ExecResult> =>
    ok(input, compare(config.left, config.operator, config.right) ? "true" : "false"),
  "logic.filter": async ({ config, input, log }) => {
    if (compare(config.left, config.operator, config.right)) return ok(input);
    log("Filter didn't match, so this branch stopped.");
    return ok(input, null);
  },
  "logic.approval": approval,
  "data.validate": async ({ config, input }) => {
    const rules = (Array.isArray(config.rules) ? config.rules : []) as Array<{ path: string; type: string }>;
    const failures = rules.filter((r) => !typeMatches(getPath(input, r.path), r.type)).map((r) => `${r.path} must be ${r.type}`);
    if (failures.length) throw new NodeError(`Data didn't pass validation: ${failures.join("; ")}.`);
    return ok(input);
  },
  "data.map": async ({ config, input }) => {
    const pairs = (Array.isArray(config.fields) ? config.fields : []) as Array<{ key: string; value: unknown }>;
    const mapped = Object.fromEntries(pairs.filter((p) => p.key && !["__proto__", "constructor", "prototype"].includes(p.key)).map((p) => [p.key, p.value]));
    return ok(config.keepInput ? { ...asObject(input), ...mapped } : mapped);
  },
  "data.split": split,
  "util.delay": delay,
  "util.log": async ({ config, input, log }) => {
    log(String(config.message ?? "").slice(0, 500));
    return ok(input);
  },
};

export { parseJson };
