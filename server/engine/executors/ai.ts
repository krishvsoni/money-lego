import "server-only";
import { z } from "zod";
import { toMinor, toPaypalValue } from "@/lib/paypal/types";
import { askJson, ownerTag, redact } from "../../ai/model";
import { isAppError } from "../../errors";
import { log } from "../../log";
import { allocationOf } from "../intents";
import { asObject, NodeError, ok, type ExecContext, type Executor } from "../types";

// AI nodes. Deterministic checks always run; the model adds judgement on top. If the model
// is unavailable the review still completes with the deterministic result and says so, so a
// busy AI provider can never silently approve or block a payment.

type Risk = "low" | "medium" | "high";
const RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };
const worst = (...r: Risk[]): Risk => r.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "low");

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  risk: Risk;
}

function deterministicChecks(ctx: ExecContext): Check[] {
  const input = asObject(ctx.input);
  const trigger = asObject(ctx.scope.trigger);
  const checks: Check[] = [];
  if (trigger.source === "test") checks.push({ name: "Test data", ok: false, detail: "This run started from editor test data, not a real PayPal payment.", risk: "medium" });
  const captureStatus = asObject(input.order).captureStatus ?? trigger.status;
  if (captureStatus && captureStatus !== "COMPLETED") checks.push({ name: "Capture completed", ok: false, detail: `PayPal reports the capture as ${String(captureStatus)}.`, risk: "high" });
  else if (captureStatus) checks.push({ name: "Capture completed", ok: true, detail: "PayPal reports the capture COMPLETED.", risk: "low" });

  let amountMinor: bigint | null = null;
  if (input.allocation) {
    try {
      const a = allocationOf(input);
      const sum = a.items.reduce((acc, i) => acc + BigInt(i.amountMinor), 0n);
      const reconciles = sum.toString() === a.totalMinor;
      checks.push({ name: "Shares reconcile", ok: reconciles, detail: reconciles ? `Shares add up to exactly ${a.total} ${a.currency}.` : `Shares add up to ${toPaypalValue(sum)}, not ${a.total}.`, risk: reconciles ? "low" : "high" });
      const triggerCurrency = trigger.currency ?? asObject(input.order).currency;
      if (triggerCurrency && triggerCurrency !== a.currency) checks.push({ name: "Currency matches", ok: false, detail: `Payment is in ${String(triggerCurrency)} but the split is in ${a.currency}.`, risk: "high" });
      const missing = a.items.filter((i) => !i.keep && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.receiver));
      checks.push({ name: "Recipients valid", ok: missing.length === 0, detail: missing.length ? `${missing.length} recipient(s) without a valid PayPal email.` : `${a.items.filter((i) => !i.keep).length} recipient(s), ${a.items.filter((i) => i.keep).length} reserve(s).`, risk: missing.length ? "high" : "low" });
      amountMinor = BigInt(a.payoutMinor);
    } catch (error) {
      checks.push({ name: "Allocation readable", ok: false, detail: error instanceof Error ? error.message : "Unreadable allocation.", risk: "high" });
    }
  } else if (typeof input.amountMinor === "string" && /^\d+$/.test(input.amountMinor)) amountMinor = BigInt(input.amountMinor);
  else if (typeof trigger.amountMinor === "string" && /^\d+$/.test(trigger.amountMinor)) amountMinor = BigInt(trigger.amountMinor);

  const max = String(ctx.config.maxAmount ?? "").trim();
  if (max && amountMinor !== null) {
    try {
      const limit = toMinor(max, "Flag above");
      const over = amountMinor > limit;
      checks.push({ name: "Within limit", ok: !over, detail: over ? `${toPaypalValue(amountMinor)} is above your ${toPaypalValue(limit)} limit.` : `${toPaypalValue(amountMinor)} is within your ${toPaypalValue(limit)} limit.`, risk: over ? "high" : "low" });
    } catch {
      checks.push({ name: "Within limit", ok: false, detail: "Flag above isn't a valid amount.", risk: "medium" });
    }
  }
  return checks;
}

const reviewSchema = z.object({
  risk: z.enum(["low", "medium", "high"]),
  summary: z.string().min(1).max(600),
  flags: z.array(z.string().max(200)).max(6).default([]),
});

const review: Executor = async (ctx) => {
  const checks = deterministicChecks(ctx);
  let ai: z.infer<typeof reviewSchema> | null = null;
  let aiNote: string | null = null;
  try {
    ai = await askJson({
      tag: ownerTag(ctx.ownerId),
      schema: reviewSchema,
      system:
        "You review payment-operations data for a small business before a human approves a PayPal action. Point out anything unusual or risky (amounts, recipients, mismatches, missing data, test data). Never recommend approving or rejecting; describe risk only. Keep the summary under 3 sentences.",
      user: JSON.stringify({
        workflow: ctx.run.workflowName,
        guidance: String(ctx.config.guidance ?? "").slice(0, 600),
        deterministicChecks: checks.map(({ name, ok, detail }) => ({ name, ok, detail })),
        trigger: redact(ctx.scope.trigger),
        data: redact(ctx.input),
        answerShape: { risk: "low|medium|high", summary: "string", flags: ["string"] },
      }),
    });
  } catch (error) {
    aiNote = isAppError(error) ? error.message : "The AI model didn't answer.";
    log.warn("ai.review_unavailable", { runId: ctx.run._id.toHexString() });
  }
  const risk = worst(...checks.map((c) => c.risk), ai?.risk ?? "low");
  const failed = checks.filter((c) => !c.ok);
  const summary = ai?.summary ?? (failed.length ? `Checks flagged: ${failed.map((c) => c.detail).join(" ")}` : "All deterministic checks passed.") + (aiNote ? ` (AI review unavailable: ${aiNote})` : "");
  const result = { risk, summary, flags: [...failed.map((c) => c.detail), ...(ai?.flags ?? [])].slice(0, 8), checks: checks.map(({ name, ok, detail }) => ({ name, ok, detail })), model: ai ? "ai+rules" : "rules only" };
  ctx.log(`AI risk review: ${risk}. ${summary.slice(0, 200)}`);
  const highConnected = ctx.run.graph.edges.some((e) => e.source === ctx.node.id && e.sourcePort === "high");
  return ok({ ...asObject(ctx.input), review: result }, risk === "high" && highConnected ? "high" : "main");
};

const draftSchema = z.object({
  drafts: z
    .array(z.object({ index: z.number().int().min(0).max(9), subject: z.string().min(1).max(200), message: z.string().min(1).max(1500) }))
    .min(1)
    .max(10),
});

const write: Executor = async (ctx) => {
  const data = ctx.config.data;
  const list = Array.isArray(data) ? data.slice(0, 10) : null;
  if (Array.isArray(data) && data.length === 0) {
    ctx.log("Nothing to write about: the list is empty.");
    return ok({ ...asObject(ctx.input), drafts: [] });
  }
  const items = list ?? [data ?? ctx.input];
  let answer: z.infer<typeof draftSchema>;
  try {
    answer = await askJson({
      tag: ownerTag(ctx.ownerId),
      schema: draftSchema,
      system: `You write short business messages for a small business, in a ${String(ctx.config.tone ?? "friendly")} tone. Use only facts present in the data (numbers, dates, ids); never invent amounts, dates, links or promises. No placeholders like [Name]. Plain text, no markdown.`,
      user: JSON.stringify({
        instructions: String(ctx.config.instructions ?? "").slice(0, 1000),
        items: items.map((item, index) => ({ index, data: redact(item) })),
        answerShape: { drafts: [{ index: "number (item index)", subject: "string", message: "string" }] },
      }),
    });
  } catch (error) {
    throw new NodeError(isAppError(error) ? `The AI writer is unavailable: ${error.message}` : "The AI writer is unavailable.");
  }
  const byIndex = new Map(answer.drafts.map((d) => [d.index, d]));
  if (list) {
    const merged = list.map((item, i) => ({ ...asObject(item), subject: byIndex.get(i)?.subject ?? null, message: byIndex.get(i)?.message ?? null }));
    const missing = merged.filter((m) => !m.message).length;
    if (missing) ctx.log(`${missing} item(s) got no draft; they'll use the default note.`, "warn");
    // Writing back over the same key the list came from lets the next node keep reading {{ input.invoices }}.
    const sourceKey = typeof ctx.node.config.data === "string" ? /^\{\{\s*input\.([A-Za-z_]\w*)\s*\}\}$/.exec(ctx.node.config.data)?.[1] : undefined;
    return ok({ ...asObject(ctx.input), ...(sourceKey ? { [sourceKey]: merged } : {}), drafts: merged });
  }
  const d = byIndex.get(0) ?? answer.drafts[0];
  return ok({ ...asObject(ctx.input), draft: { subject: d.subject, message: d.message } });
};

export const aiExecutors: Record<string, Executor> = { "ai.review": review, "ai.write": write };
