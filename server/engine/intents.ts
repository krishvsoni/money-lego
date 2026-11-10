import "server-only";
import { createHash } from "node:crypto";
import { isSideEffect, nodeDefinition } from "@/lib/nodes/registry";
import { isCurrency, toMinor, toPaypalValue, type Allocation } from "@/lib/paypal/types";
import { resolveValue, type Scope } from "@/lib/workflow/expressions";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { asObject, NodeError } from "./types";

// An intent is the exact, normalised description of what a side-effect node is about to
// do at PayPal: who gets how much, which capture is refunded, which invoices are messaged.
// The approval computes and shows each intent and records its fingerprint; the node
// recomputes its own intent at execution time and refuses to act if the fingerprints
// differ. So "approve" always means "exactly this", even if data changed in between.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_INVOICES_PER_RUN = 10;

export type Intent =
  | { kind: "payout"; currency: string; totalMinor: string; total: string; subject: string; items: Array<{ receiver: string; amountMinor: string; amount: string; label: string }> }
  | { kind: "refund"; captureId: string; amountMinor: string | null; amount: string | null; currency: string | null; note: string }
  | { kind: "invoice_send" | "invoice_remind"; subject: string; invoices: Array<{ invoiceId: string; number: string | null; note: string }> }
  | { kind: "checkout"; productId: string; title: string; merchant: string | null; price: string; currency: string; note: string };

const text = (v: unknown, max = 1000) => (v === undefined || v === null ? "" : String(v)).trim().slice(0, max);

export function allocationOf(input: unknown): Allocation {
  const a = asObject(asObject(input).allocation);
  const items = Array.isArray(a.items) ? (a.items as Array<Record<string, unknown>>) : null;
  if (!isCurrency(a.currency) || !items) throw new NodeError("This step needs an allocation from Split allocation right before the approval.");
  return a as unknown as Allocation;
}

function payoutIntent(config: Record<string, unknown>, input: unknown): Intent {
  const allocation = allocationOf(input);
  const paid = allocation.items.filter((i) => !i.keep);
  if (!paid.length) {
    const who = allocation.items.map((i) => (i as { label?: string }).label).filter(Boolean);
    throw new NodeError(
      `Nobody to pay: ${who.length ? who.join(", ") : "every recipient"} ${who.length === 1 ? "has" : "have"} no PayPal email in Split allocation, so the whole amount counts as kept by the business. Open Split allocation, add a PayPal email under Recipients, then run again.`,
    );
  }
  if (paid.length > 15) throw new NodeError("A payout here pays at most 15 recipients at once.");
  const seen = new Set<string>();
  const items = paid.map((i, n) => {
    const receiver = text(i.receiver, 254).toLowerCase();
    if (!EMAIL.test(receiver)) throw new NodeError(`Recipient ${n + 1} (${i.label || "unnamed"}) has no valid PayPal email.`);
    if (seen.has(receiver)) throw new NodeError(`${receiver} appears twice. Merge the shares first.`);
    seen.add(receiver);
    if (!/^\d+$/.test(i.amountMinor) || BigInt(i.amountMinor) <= 0n) throw new NodeError(`Recipient ${n + 1} would receive nothing.`);
    return { receiver, amountMinor: i.amountMinor, amount: toPaypalValue(i.amountMinor), label: text(i.label, 60) };
  });
  const totalMinor = items.reduce((acc, i) => acc + BigInt(i.amountMinor), 0n).toString();
  return { kind: "payout", currency: allocation.currency, totalMinor, total: toPaypalValue(totalMinor), subject: text(config.subject, 200), items };
}

function refundIntent(config: Record<string, unknown>): Intent {
  const captureId = text(config.captureId, 40);
  if (!/^[A-Z0-9-]{6,40}$/i.test(captureId)) throw new NodeError("Capture ID didn't resolve to a PayPal capture id.");
  const amount = text(config.amount, 20);
  if (!amount) return { kind: "refund", captureId, amountMinor: null, amount: null, currency: null, note: text(config.note, 255) };
  const currency = text(config.currency, 3).toUpperCase();
  if (!isCurrency(currency)) throw new NodeError("Pick the currency for a partial refund.");
  const minor = toMinor(amount, "Refund amount");
  if (minor <= 0n) throw new NodeError("Refund amount must be more than zero.");
  return { kind: "refund", captureId, amountMinor: minor.toString(), amount: toPaypalValue(minor), currency, note: text(config.note, 255) };
}

function invoiceIntent(config: Record<string, unknown>, input: unknown): Intent {
  const o = asObject(input);
  const list = Array.isArray(o.invoices) ? (o.invoices as unknown[]) : o.invoice ? [o.invoice] : [];
  if (!list.length) throw new NodeError("No invoices to send. Connect this after Find invoices or Create invoice.");
  if (list.length > MAX_INVOICES_PER_RUN) throw new NodeError(`${list.length} invoices is more than ${MAX_INVOICES_PER_RUN} per run. Narrow the search.`);
  const invoices = list.map((raw, n) => {
    const inv = asObject(raw);
    const invoiceId = text(inv.id, 40);
    if (!/^INV2-[A-Z0-9-]{4,40}$/i.test(invoiceId)) throw new NodeError(`Invoice ${n + 1} has no PayPal invoice id.`);
    const note = text(inv.message, 1000) || text(config.note, 1000);
    return { invoiceId, number: inv.number ? text(inv.number, 40) : null, note };
  });
  return { kind: config.mode === "send" ? "invoice_send" : "invoice_remind", subject: text(config.subject, 200), invoices };
}

// A checkout for one product the earlier search returned, at the price that search reported.
// The executor re-reads the price from Channel3 and refuses if it moved.
function checkoutIntent(config: Record<string, unknown>, input: unknown): Intent {
  const o = asObject(input);
  const productId = text(config.productId, 64);
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(productId)) throw new NodeError("Product didn't resolve to a Channel3 product id. Connect this after Channel3 search and AI pick product.");
  const candidates = [o.pick, ...(Array.isArray(o.products) ? o.products : [])].map(asObject);
  const product = candidates.find((p) => p.id === productId);
  if (!product) throw new NodeError("That product isn't one the search returned, so it can't be bought here.");
  const currency = text(product.currency, 3).toUpperCase();
  if (!isCurrency(currency) || !product.price) throw new NodeError("This product has no price in a currency PayPal checkout supports here.");
  const price = toPaypalValue(toMinor(text(product.price, 20), "Price"));
  return { kind: "checkout", productId, title: text(product.title, 200), merchant: product.merchant ? text(product.merchant, 120) : null, price, currency, note: text(config.note, 120) };
}

const BUILDERS: Record<string, (config: Record<string, unknown>, input: unknown) => Intent> = {
  "paypal.checkout_link": checkoutIntent,
  "paypal.payout": payoutIntent,
  "paypal.refund": refundIntent,
  "paypal.send_invoice": invoiceIntent,
};

export function intentFor(type: string, config: Record<string, unknown>, input: unknown): Intent {
  const build = BUILDERS[type];
  if (!build) throw new NodeError(`${type} has no approval description.`);
  return build(config, input);
}

// Canonical JSON (sorted keys) so equal intents always hash equally.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const intentHash = (intent: Intent) => createHash("sha256").update(canonical(intent)).digest("hex");

export interface PlannedAction {
  nodeId: string;
  type: string;
  title: string;
  intent: Intent;
  hash: string;
}

const withoutApproval = (input: unknown) => {
  const rest = { ...asObject(input) };
  delete rest.approval;
  return rest;
};

// What each side-effect node on this approval's Approved branch will do, resolved against
// the same data it will see. Throws (failing the approval early) when an action can't be
// described, e.g. a payout without a valid allocation: nobody should approve a broken plan.
export function planActions(graph: WorkflowGraph, approvalNodeId: string, input: unknown, scope: Scope): PlannedAction[] {
  const targets = graph.edges.filter((e) => e.source === approvalNodeId && e.sourcePort === "approved").map((e) => graph.nodes.find((n) => n.id === e.target));
  return targets
    .filter((n): n is NonNullable<typeof n> => !!n && !n.disabled && isSideEffect(n.type))
    .map((n) => {
      const config = resolveValue(n.config, { ...scope, input }) as Record<string, unknown>;
      const intent = intentFor(n.type, config, withoutApproval(input));
      return { nodeId: n.id, type: n.type, title: n.label || nodeDefinition(n.type)?.title || n.type, intent, hash: intentHash(intent) };
    });
}

export const plannedHash = (actions: PlannedAction[]) => createHash("sha256").update(actions.map((a) => `${a.nodeId}:${a.hash}`).join("|")).digest("hex");

// Called by a side-effect executor before it touches PayPal.
export function requireApproved(nodeId: string, type: string, config: Record<string, unknown>, input: unknown): Intent {
  const approval = asObject(asObject(input).approval);
  const approvedHash = asObject(approval.actions)[nodeId];
  if (approval.decision !== "approved" || typeof approvedHash !== "string") {
    throw new NodeError("This action needs a Human approval's Approved output right before it. Nothing was sent.");
  }
  const intent = intentFor(type, config, withoutApproval(input));
  if (intentHash(intent) !== approvedHash) throw new NodeError("What this step would do changed after it was approved, so it refused to run. Nothing was sent.");
  return intent;
}
