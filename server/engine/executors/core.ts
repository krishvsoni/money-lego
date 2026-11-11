import "server-only";
import { getPath } from "@/lib/workflow/expressions";
import { planActions, plannedHash } from "../intents";
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
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case "object":
      return !!value && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    default:
      return false;
  }
}

// Pauses until the owner decides. Before pausing it works out exactly what every PayPal
// action on the Approved branch will do and fingerprints it; on approval the plan is
// recomputed and must still match, and each action re-checks its own fingerprint.
const approval: Executor = async ({ config, input, waitState, run, node, scope }) => {
  const decision = waitState?.decision as string | undefined;
  const actions = planActions(run.graph, node.id, input, scope);
  const payloadHash = plannedHash(actions);
  if (decision === "approved" || decision === "rejected") {
    if (decision === "approved" && waitState?.payloadHash && waitState.payloadHash !== payloadHash) {
      throw new NodeError("What would happen changed after it was shown for review, so the approval doesn't apply. Nothing was sent.");
    }
    const approvalInfo = { decision, by: waitState?.by ?? null, at: waitState?.at ?? null, payloadHash, actions: Object.fromEntries(actions.map((a) => [a.nodeId, a.hash])) };
    return ok({ ...asObject(input), approval: approvalInfo }, decision);
  }
  const until = waitState?.until ? new Date(String(waitState.until)) : new Date(Date.now() + Number(config.timeoutHours ?? 24) * 3_600_000);
  if (until.getTime() <= Date.now()) throw new NodeError("Nobody approved this in time, so the run stopped. Nothing was sent.");
  return {
    kind: "wait",
    wait: { kind: "approval", until, ref: null },
    state: { until: until.toISOString(), message: String(config.message ?? ""), payloadHash, actions: actions.map(({ nodeId, type, title, intent }) => ({ nodeId, type, title, intent })) },
  };
};

const delay: Executor = async ({ config, input, waitState }) => {
  const until = waitState?.until ? new Date(String(waitState.until)) : new Date(Date.now() + Number(config.minutes ?? 1) * 60_000);
  if (until.getTime() <= Date.now()) return ok(input);
  return { kind: "wait", wait: { kind: "delay", until, ref: null }, state: { until: until.toISOString() } };
};

export const coreExecutors: Record<string, Executor> = {
  "trigger.manual": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.paypal_checkout": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.paypal_event": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.webhook": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.schedule": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.github": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.stripe": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.shopify": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.discord": async ({ run }) => ok(run.trigger.payload ?? {}),
  "trigger.slack_mention": async ({ run }) => ok(run.trigger.payload ?? {}),
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
  "util.delay": delay,
  "util.log": async ({ config, input, log }) => {
    log(String(config.message ?? "").slice(0, 500));
    return ok(input);
  },
};

export { parseJson, typeMatches };
