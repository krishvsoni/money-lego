import "server-only";
import { z } from "zod";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { SessionUser } from "../auth/session";
import { getRunDetail } from "../engine/runs";
import { searchRuns } from "../integrations/elastic";
import { askJson, ownerTag, redact } from "./model";

// "Explain this run": a plain-language summary of what happened, grounded only in the
// persisted run record (statuses, errors, node outputs, PayPal ids). Read-only.

// A slightly long answer is trimmed, never rejected: rejecting it costs a second model call
// and then an error, for a summary that was fine.
const clip = (max: number) => z.string().trim().min(1).transform((s) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s));
const schema = z.object({
  headline: clip(160),
  summary: clip(900),
  nextSteps: z
    .array(z.string())
    .catch([])
    .default([])
    .transform((list) => list.map((s) => s.trim()).filter(Boolean).slice(0, 4).map((s) => (s.length > 240 ? `${s.slice(0, 239)}…` : s))),
});

// The model gets at most this many characters of run record. It is built to fit, rather
// than cut mid-way, so the JSON it reads is always whole and every step is in it.
const BUDGET = 11_000;

// A node's output, shrunk to what explains a run: short strings, the first few list items,
// no images or long URLs. Product searches return dozens of fields per product.
function compact(value: unknown, depth = 0): unknown {
  if (depth > 3) return "…";
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 159)}…` : value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 4).map((v) => compact(v, depth + 1));
    return value.length > 4 ? [...items, `…and ${value.length - 4} more`] : items;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([k]) => !/image|thumbnail|url$|href|raw|links/i.test(k));
    return Object.fromEntries(entries.slice(0, 20).map(([k, v]) => [k, compact(v, depth + 1)]));
  }
  return value;
}

// Elastic is optional context: if it is slow, explain without it.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export async function explainRun(user: SessionUser, runId: string) {
  const run = await getRunDetail(user, runId, false);
  const steps = (run.nodes ?? []).map((n) => ({
    node: n.nodeId,
    title: nodeDefinition(n.nodeType)?.title ?? n.nodeType,
    status: n.status,
    branch: n.port,
    error: n.error,
    output: compact(redact(n.output)),
  }));
  const similar = run.error
    ? ((await withTimeout(searchRuns(user.userId, run.error, { status: "failed", limit: 5 }), 2_500))?.hits ?? []).filter((h) => h.runId !== run.id).slice(0, 3)
    : [];

  const record = {
    status: run.status,
    error: run.error,
    waiting: run.waiting,
    trigger: compact(redact(run.trigger)),
    log: run.log.slice(-15),
    steps,
    similarPastFailures: similar.map((s) => ({ workflow: s.workflowName, error: s.error, at: s.startedAt })),
  };
  // Still too big: drop outputs of steps that didn't run first, then all outputs. Statuses,
  // branches and errors always stay, since they are what the explanation is about.
  let payload = JSON.stringify(record);
  if (payload.length > BUDGET) {
    record.steps = steps.map((s) => (s.status === "succeeded" || s.status === "failed" || s.status === "waiting" ? s : { ...s, output: undefined }));
    payload = JSON.stringify(record);
  }
  if (payload.length > BUDGET) {
    record.steps = steps.map((s) => ({ ...s, output: undefined }));
    record.log = run.log.slice(-8);
    payload = JSON.stringify(record);
  }

  return askJson({
    tag: ownerTag(user.userId),
    schema,
    tier: "fast",
    system:
      "You explain a finished or paused payment-automation run to a small-business owner. Use only the run record. " +
      "headline: one sentence, under 120 characters, saying how the run ended. " +
      "summary: 2 to 4 short sentences: what started it, what the important steps did (PayPal actions with their ids and statuses), whether money moved, and why it stopped if it failed or is waiting. " +
      "nextSteps: up to 3 short, concrete actions, only when useful. " +
      "If similar past failures are given, say whether this looks like a recurring problem. Plain language, no markdown.",
    user: payload,
  });
}
