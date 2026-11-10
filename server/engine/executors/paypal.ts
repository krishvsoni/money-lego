import "server-only";
import { AmountError, splitByPercent, splitEvenly } from "@/lib/amounts";
import { MAX_RECIPIENTS } from "@/lib/nodes/catalog/data";
import { isCurrency, PAYOUT_BATCH_FINAL, PAYOUT_ITEM_PROBLEM, referenceFor, toMinor, toPaypalValue, type Allocation, type AllocationItem } from "@/lib/paypal/types";
import { env } from "../../config/env";
import { collections } from "../../db/collections";
import { getProduct } from "../../integrations/channel3";
import { PaypalError } from "../../paypal/client";
import { isAppError } from "../../errors";
import * as paypal from "../../paypal/api";
import { FOREIGN_OBJECT, ownedByAnother, ownPaypalIds, ownsPaypalAccount } from "../../paypal/ownership";
import { maskEmail, minorOf, recordResource } from "../../paypal/resources";
import { requireApproved } from "../intents";
import { asObject, NodeError, ok, type ExecContext, type Executor } from "../types";

// PayPal executors. Reads call PayPal and summarise. Writes first re-check the approval
// fingerprint (requireApproved), then call PayPal with an idempotency key derived from the
// run and node, so retrying a step returns PayPal's first answer instead of acting twice.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const idemKey = (ctx: ExecContext, suffix = "") => `ml-${ctx.run._id.toHexString()}-${ctx.node.id}${suffix ? `-${suffix}` : ""}`;
const owner = (ctx: ExecContext) => ({ ownerId: ctx.ownerId, workflowId: ctx.run.workflowId, runId: ctx.run._id, nodeId: ctx.node.id });
const text = (v: unknown, max = 500) => (v === undefined || v === null ? "" : String(v)).trim().slice(0, max);

// PayPal errors already carry a plain message; anything else is wrapped so the run log
// explains what happened without leaking internals.
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isAppError(error)) throw new NodeError(error.message);
    throw error;
  }
}

// ---------- data.allocate ----------

export function allocate(config: Record<string, unknown>): Allocation {
  const currency = text(config.currency, 3).toUpperCase();
  if (!isCurrency(currency)) throw new NodeError(`Currency "${currency || "empty"}" isn't supported. Use USD, EUR, GBP, CAD or AUD.`);
  const rows = (Array.isArray(config.recipients) ? config.recipients : []) as Array<Record<string, unknown>>;
  if (!rows.length || rows.length > MAX_RECIPIENTS) throw new NodeError(`Use between 1 and ${MAX_RECIPIENTS} recipients.`);
  let total: bigint;
  try {
    total = toMinor(text(config.total, 30), "Amount to split");
  } catch (e) {
    throw new NodeError(e instanceof AmountError ? e.message : "Amount to split isn't a number.");
  }
  if (total <= 0n) throw new NodeError("There's nothing to split: the amount is zero.");

  const seen = new Set<string>();
  const receivers = rows.map((r, i) => {
    const email = text(r.email, 254).toLowerCase();
    if (email && !EMAIL.test(email)) throw new NodeError(`Recipient ${i + 1}: "${email.slice(0, 60)}" isn't an email address.`);
    if (email && seen.has(email)) throw new NodeError(`Recipient ${i + 1} repeats ${email}.`);
    if (email) seen.add(email);
    return email;
  });

  let amounts: bigint[];
  if (config.mode === "even") amounts = splitEvenly(total, rows.length);
  else if (config.mode === "fixed") {
    amounts = rows.map((r, i) => {
      try {
        return toMinor(text(r.share, 30), `Recipient ${i + 1}`);
      } catch (e) {
        throw new NodeError((e as Error).message);
      }
    });
    const sum = amounts.reduce((a, b) => a + b, 0n);
    if (sum !== total) throw new NodeError(`Fixed amounts add up to ${toPaypalValue(sum)} ${currency}, not ${toPaypalValue(total)}. Nothing was adjusted.`);
  } else {
    const hundredths = rows.map((r, i) => {
      const v = text(r.share, 10);
      if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new NodeError(`Recipient ${i + 1}: use a percentage with up to 2 decimals.`);
      return Math.round(Number(v) * 100);
    });
    if (hundredths.reduce((a, b) => a + b, 0) !== 10_000) throw new NodeError("Percentages must add up to 100.");
    amounts = splitByPercent(total, hundredths);
  }
  const zero = amounts.findIndex((a) => a <= 0n);
  if (zero >= 0) throw new NodeError(`Recipient ${zero + 1} would receive nothing. Raise the amount or their share.`);

  const items: AllocationItem[] = amounts.map((a, i) => ({ receiver: receivers[i], amountMinor: a.toString(), label: text(rows[i].label, 60), keep: !receivers[i] }));
  const payoutMinor = items.filter((i) => !i.keep).reduce((acc, i) => acc + BigInt(i.amountMinor), 0n);
  return { currency, totalMinor: total.toString(), total: toPaypalValue(total), items, payoutMinor: payoutMinor.toString(), payout: toPaypalValue(payoutMinor) };
}

// ---------- reads ----------

function captureSummary(c: paypal.CaptureObject | undefined) {
  const b = c?.seller_receivable_breakdown;
  return {
    captureId: c?.id ?? null,
    captureStatus: c?.status ?? null,
    currency: c?.amount?.currency_code ?? null,
    amount: c?.amount?.value ?? null,
    amountMinor: minorOf(c?.amount),
    fee: b?.paypal_fee?.value ?? null,
    net: b?.net_amount?.value ?? c?.amount?.value ?? null,
    netMinor: minorOf(b?.net_amount ?? c?.amount),
  };
}

const getOrder: Executor = async (ctx) => {
  const id = text(ctx.config.orderId, 40);
  // Editor test runs carry made-up ids; say so plainly instead of asking PayPal about them.
  if (asObject(ctx.scope.trigger).source === "test" && id.startsWith("TEST-")) {
    const t = asObject(ctx.scope.trigger);
    ctx.log("Test data: PayPal was not called. Pay the checkout page to run this against a real sandbox order.", "warn");
    return ok({ ...asObject(ctx.input), order: { id, status: "COMPLETED", captureId: t.captureId ?? null, captureStatus: t.status ?? "COMPLETED", currency: t.currency ?? null, amount: t.amount ?? null, amountMinor: t.amountMinor ?? null, fee: t.fee ?? null, net: t.net ?? null, netMinor: t.netMinor ?? null, test: true } });
  }
  if (!/^[A-Z0-9-]{6,40}$/i.test(id)) throw new NodeError("Order ID didn't resolve to a PayPal order id.");
  if (await ownedByAnother(id, ctx.ownerId, ["order"])) throw new NodeError(FOREIGN_OBJECT);
  const order = await call(() => paypal.getOrder(id));
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  const summary = { id: order.id, status: order.status, ...captureSummary(capture) };
  await recordResource({ kind: "order", paypalId: order.id, status: order.status, amount: order.purchase_units?.[0]?.amount, owner: owner(ctx) });
  if (capture) await recordResource({ kind: "capture", paypalId: capture.id, status: capture.status, amount: capture.amount, detail: { orderId: order.id }, owner: owner(ctx) });
  if (ctx.config.requireCompleted && summary.captureStatus !== "COMPLETED") {
    throw new NodeError(`PayPal reports this order's capture as ${summary.captureStatus ?? "missing"}, not COMPLETED, so nothing further runs.`);
  }
  return ok({ ...asObject(ctx.input), order: summary });
};

const findInvoices: Executor = async (ctx) => {
  const statuses = ctx.config.status === "UNPAID" ? ["SENT", "UNPAID", "PARTIALLY_PAID"] : [text(ctx.config.status, 20)];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const limit = Math.min(20, Math.max(1, Number(ctx.config.limit ?? 10)));
  const result = await call(() => paypal.searchInvoices({ statuses, dueBefore: ctx.config.overdueOnly ? yesterday : undefined, pageSize: limit }));
  const found = (result.items ?? [])
    .map((inv) => {
      const due = inv.detail?.payment_term?.due_date ?? null;
      const daysOverdue = due ? Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000) : null;
      return {
        id: inv.id,
        number: inv.detail?.invoice_number ?? null,
        status: inv.status,
        dueDate: due,
        daysOverdue,
        currency: inv.amount?.currency_code ?? inv.detail?.currency_code ?? null,
        amount: inv.amount?.value ?? null,
        due: inv.due_amount?.value ?? inv.amount?.value ?? null,
        recipient: maskEmail(inv.primary_recipients?.[0]?.billing_info?.email_address),
        recipientName: inv.primary_recipients?.[0]?.billing_info?.name?.given_name ?? null,
      };
    })
    .filter((i) => !ctx.config.overdueOnly || (i.daysOverdue !== null && i.daysOverdue > 0));
  // The PayPal account is shared: only its owner sees every invoice; others see the ones
  // their own workflows created or sent.
  const visible = ownsPaypalAccount(ctx.ownerId) ? null : await ownPaypalIds(ctx.ownerId, ["invoice"]);
  const invoices = (visible ? found.filter((i) => visible.has(i.id)) : found).slice(0, limit);
  for (const inv of invoices) await recordResource({ kind: "invoice", paypalId: inv.id, status: inv.status, amount: inv.amount && inv.currency ? { value: inv.amount, currency_code: inv.currency } : null, detail: { number: inv.number, dueDate: inv.dueDate } });
  ctx.log(`Found ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}.`);
  return ok({ ...asObject(ctx.input), invoices, invoiceCount: invoices.length });
};

const createInvoice: Executor = async (ctx) => {
  const { workflows } = await collections();
  const workflow = await workflows.findOne({ _id: ctx.run.workflowId }, { projection: { webhookKey: 1 } });
  const email = text(ctx.config.recipientEmail, 254).toLowerCase();
  if (!EMAIL.test(email)) throw new NodeError("Bill to didn't resolve to an email address.");
  const currency = text(ctx.config.currency, 3).toUpperCase();
  if (!isCurrency(currency)) throw new NodeError("Pick a supported currency.");
  let minor: bigint;
  try {
    minor = toMinor(text(ctx.config.amount, 30), "Amount");
  } catch (e) {
    throw new NodeError((e as Error).message);
  }
  if (minor <= 0n) throw new NodeError("Invoice amount must be more than zero.");
  const days = Math.min(120, Math.max(0, Number(ctx.config.dueInDays ?? 14)));
  const dueDate = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const inv = await call(() =>
    paypal.createDraftInvoice({
      currency,
      recipientEmail: email,
      recipientName: text(ctx.config.recipientName, 120),
      itemName: text(ctx.config.itemName, 200) || "Services",
      amountMinor: minor,
      dueDate,
      note: text(ctx.config.note, 1000),
      reference: referenceFor(workflow?.webhookKey ?? "unknown-workflow-key"),
      requestId: idemKey(ctx),
    }),
  );
  const invoice = { id: inv.id, number: inv.detail?.invoice_number ?? null, status: inv.status, currency, amount: toPaypalValue(minor), due: toPaypalValue(minor), dueDate, recipient: maskEmail(email) };
  await recordResource({ kind: "invoice", paypalId: inv.id, status: inv.status, amount: { currency_code: currency, value: toPaypalValue(minor) }, counterparty: maskEmail(email), detail: { number: invoice.number, dueDate }, owner: owner(ctx) });
  return ok({ ...asObject(ctx.input), invoice, invoices: [invoice] });
};

const getSubscription: Executor = async (ctx) => {
  const id = text(ctx.config.subscriptionId, 40);
  if (!/^I-[A-Z0-9]{6,30}$/i.test(id)) throw new NodeError("Subscription ID didn't resolve to a PayPal subscription id (I-…).");
  if (await ownedByAnother(id, ctx.ownerId, ["subscription"])) throw new NodeError(FOREIGN_OBJECT);
  const s = await call(() => paypal.getSubscription(id));
  const b = s.billing_info;
  const subscription = {
    id: s.id,
    status: s.status,
    planId: s.plan_id ?? null,
    failedPayments: b?.failed_payments_count ?? 0,
    outstanding: b?.outstanding_balance?.value ?? null,
    currency: b?.outstanding_balance?.currency_code ?? b?.last_payment?.amount?.currency_code ?? null,
    lastPayment: b?.last_payment?.time ?? null,
    lastFailedAmount: b?.last_failed_payment?.amount?.value ?? null,
    lastFailedReason: b?.last_failed_payment?.reason_code ?? null,
    nextRetry: b?.last_failed_payment?.next_payment_retry_time ?? null,
    nextBillingTime: b?.next_billing_time ?? null,
    subscriber: maskEmail(s.subscriber?.email_address),
    // Kept unmasked in the owner's own run data so a catch-up invoice can be addressed; AI prompts mask it.
    subscriberEmail: s.subscriber?.email_address ?? null,
    subscriberName: s.subscriber?.name?.given_name ?? null,
  };
  await recordResource({ kind: "subscription", paypalId: s.id, status: s.status, amount: b?.outstanding_balance ?? null, detail: { failedPayments: subscription.failedPayments, reason: subscription.lastFailedReason }, owner: owner(ctx) });
  return ok({ ...asObject(ctx.input), subscription });
};

const transactions: Executor = async (ctx) => {
  const days = Math.min(31, Math.max(1, Number(ctx.config.days ?? 7)));
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const result = await call(() => paypal.searchTransactions({ start, end, pageSize: 100 }));
  const all = (result.transaction_details ?? []).map((t) => t.transaction_info ?? {});
  // Shared PayPal account: its owner sees every transaction; others only the captures,
  // refunds and payout items their own workflows made.
  const visible = ownsPaypalAccount(ctx.ownerId) ? null : await ownPaypalIds(ctx.ownerId, ["capture", "refund", "payout_item"]);
  const rows = visible ? all.filter((t) => t.transaction_id && visible.has(t.transaction_id)) : all;
  const byStatus: Record<string, { count: number; totals: Record<string, string> }> = {};
  for (const t of rows) {
    const status = t.transaction_status ?? "?";
    const entry = (byStatus[status] ??= { count: 0, totals: {} });
    entry.count++;
    const cur = t.transaction_amount?.currency_code;
    const minor = minorOf(t.transaction_amount ? { ...t.transaction_amount, value: t.transaction_amount.value.replace(/^-/, "") } : null);
    if (cur && minor) {
      const sign = t.transaction_amount?.value.startsWith("-") ? -1n : 1n;
      entry.totals[cur] = (BigInt(entry.totals[cur] ?? "0") + sign * BigInt(minor)).toString();
    }
  }
  return ok({
    ...asObject(ctx.input),
    report: {
      from: start.toISOString(),
      to: end.toISOString(),
      count: rows.length,
      byStatus,
      transactions: rows.slice(0, 25).map((t) => ({ id: t.transaction_id, code: t.transaction_event_code, status: t.transaction_status, amount: t.transaction_amount?.value, currency: t.transaction_amount?.currency_code, fee: t.fee_amount?.value ?? null, at: t.transaction_initiation_date })),
    },
  });
};

// ---------- writes (approval-bound) ----------

const payout: Executor = async (ctx) => {
  const intent = requireApproved(ctx.node.id, ctx.node.type, ctx.config, ctx.input);
  if (intent.kind !== "payout") throw new NodeError("Unexpected action.");
  const senderBatchId = idemKey(ctx);
  const { paypalResources } = await collections();
  // A batch already created by an earlier attempt of this exact step is reused, never re-sent.
  const existing = await paypalResources.findOne({ kind: "payout_batch", "detail.senderBatchId": senderBatchId });
  let batchId = existing?.paypalId ?? null;
  let status = existing?.status ?? "";
  if (!batchId) {
    const batch = await call(() =>
      paypal.createPayoutBatch({
        senderBatchId,
        currency: intent.currency as Allocation["currency"],
        subject: intent.subject || "You have a payout",
        message: text(ctx.config.note, 1000),
        items: intent.items.map((i, n) => ({ receiver: i.receiver, amountMinor: i.amountMinor, note: text(ctx.config.note, 1000) || `Payout${i.label ? ` for ${i.label}` : ""}`, senderItemId: `${senderBatchId.slice(-40)}-${n + 1}` })),
      }),
    );
    batchId = batch.batch_header.payout_batch_id;
    status = batch.batch_header.batch_status;
    await recordResource({
      kind: "payout_batch",
      paypalId: batchId,
      status,
      amount: { currency_code: intent.currency, value: intent.total },
      counterparty: `${intent.items.length} recipient${intent.items.length === 1 ? "" : "s"}`,
      detail: { senderBatchId, items: intent.items.length, sideEffect: true },
      owner: owner(ctx),
    });
  }
  ctx.log(`PayPal accepted payout batch ${batchId} (${status}). Accepted is not paid; Payout status follows it.`);
  return ok({ ...asObject(ctx.input), payout: { batchId, senderBatchId, status, currency: intent.currency, totalMinor: intent.totalMinor, total: intent.total, items: intent.items.map((i) => ({ receiver: maskEmail(i.receiver), amount: i.amount, label: i.label })) } });
};

const payoutStatus: Executor = async (ctx) => {
  const batchId = text(asObject(asObject(ctx.input).payout).batchId, 40);
  if (!batchId) throw new NodeError("No payout batch to follow. Connect this after PayPal payout.");
  if (await ownedByAnother(batchId, ctx.ownerId, ["payout_batch"])) throw new NodeError(FOREIGN_OBJECT);
  const batch = await call(() => paypal.getPayoutBatch(batchId));
  const status = batch.batch_header.batch_status;
  const items = (batch.items ?? []).map((i) => ({ receiver: maskEmail(i.payout_item.receiver), amount: i.payout_item.amount.value, currency: i.payout_item.amount.currency, status: i.transaction_status ?? "PENDING", error: i.errors?.message ?? null }));
  await recordResource({ kind: "payout_batch", paypalId: batchId, status, detail: { paid: items.filter((i) => i.status === "SUCCESS").length } });
  for (const i of batch.items ?? []) {
    await recordResource({ kind: "payout_item", paypalId: i.payout_item_id, status: i.transaction_status ?? "PENDING", amount: { currency_code: i.payout_item.amount.currency, value: i.payout_item.amount.value }, counterparty: maskEmail(i.payout_item.receiver), detail: { batchId }, owner: owner(ctx) });
  }
  const pendingItems = items.filter((i) => ["PENDING", "ONHOLD", "NEW"].includes(i.status));
  if (PAYOUT_BATCH_FINAL.includes(status) && pendingItems.length === 0) {
    const problems = items.filter((i) => PAYOUT_ITEM_PROBLEM.includes(i.status) || i.status === "UNCLAIMED");
    const summary = { batchId, status, paid: items.filter((i) => i.status === "SUCCESS").length, problems: problems.length, items };
    if (status !== "SUCCESS" || problems.length) {
      const failure = `Payout batch ${status.toLowerCase()}${problems.length ? `, ${problems.length} item(s) ${[...new Set(problems.map((p) => p.status.toLowerCase()))].join("/")}` : ""}.`;
      const handled = ctx.run.graph.edges.some((e) => e.source === ctx.node.id && e.sourcePort === "failed");
      if (handled) return ok({ ...asObject(ctx.input), payoutStatus: { ...summary, failure } }, "failed");
      throw new NodeError(failure);
    }
    return ok({ ...asObject(ctx.input), payoutStatus: summary });
  }
  const until = ctx.waitState?.until ? new Date(String(ctx.waitState.until)) : new Date(Date.now() + Number(ctx.config.timeoutHours ?? 48) * 3_600_000);
  if (until.getTime() <= Date.now()) throw new NodeError(`The payout batch is still ${status} after the time limit. It may still complete; check it on the Payments page.`);
  return { kind: "wait", wait: { kind: "provider", until, ref: `payout:${batchId}` }, state: { until: until.toISOString(), lastStatus: status } };
};

const refund: Executor = async (ctx) => {
  const intent = requireApproved(ctx.node.id, ctx.node.type, ctx.config, ctx.input);
  if (intent.kind !== "refund") throw new NodeError("Unexpected action.");
  // Never refund money another account's workflow collected.
  if (await ownedByAnother(intent.captureId, ctx.ownerId, ["capture", "order"])) throw new NodeError(FOREIGN_OBJECT);
  const r = await call(() =>
    paypal.refundCapture({ captureId: intent.captureId, currency: (intent.currency ?? undefined) as Allocation["currency"] | undefined, amountMinor: intent.amountMinor ? BigInt(intent.amountMinor) : null, note: intent.note, requestId: idemKey(ctx) }),
  );
  await recordResource({ kind: "refund", paypalId: r.id, status: r.status, amount: r.amount ?? null, detail: { captureId: intent.captureId, sideEffect: true }, owner: owner(ctx) });
  await recordResource({ kind: "capture", paypalId: intent.captureId, status: intent.amountMinor ? "PARTIALLY_REFUNDED" : "REFUNDED" });
  return ok({ ...asObject(ctx.input), refund: { id: r.id, status: r.status, captureId: intent.captureId, amount: r.amount?.value ?? intent.amount, currency: r.amount?.currency_code ?? intent.currency } });
};

const sendInvoice: Executor = async (ctx) => {
  const intent = requireApproved(ctx.node.id, ctx.node.type, ctx.config, ctx.input);
  if (intent.kind !== "invoice_send" && intent.kind !== "invoice_remind") throw new NodeError("Unexpected action.");
  const { paypalResources } = await collections();
  // Only invoices this account may act on: never another account's, and (unless this account
  // owns the PayPal app) only ones its own workflows created or found as its own.
  const mine = ownsPaypalAccount(ctx.ownerId) ? null : await ownPaypalIds(ctx.ownerId, ["invoice"]);
  for (const inv of intent.invoices) {
    if ((mine && !mine.has(inv.invoiceId)) || (await ownedByAnother(inv.invoiceId, ctx.ownerId, ["invoice"]))) throw new NodeError(FOREIGN_OBJECT);
  }
  const sent: Array<{ invoiceId: string; action: string; status: string }> = [];
  for (const inv of intent.invoices) {
    const requestId = idemKey(ctx, inv.invoiceId);
    const done = await paypalResources.findOne({ kind: "invoice", paypalId: inv.invoiceId, "detail.lastActionKey": requestId });
    if (!done) {
      if (intent.kind === "invoice_send") await call(() => paypal.sendInvoice(inv.invoiceId, { subject: intent.subject, note: inv.note, requestId }));
      else await call(() => paypal.remindInvoice(inv.invoiceId, { subject: intent.subject, note: inv.note, requestId }));
      await recordResource({ kind: "invoice", paypalId: inv.invoiceId, status: intent.kind === "invoice_send" ? "SENT" : "REMINDED", detail: { lastActionKey: requestId, lastAction: intent.kind, sideEffect: true, number: inv.number }, owner: owner(ctx) });
    }
    sent.push({ invoiceId: inv.invoiceId, action: intent.kind === "invoice_send" ? "sent" : "reminded", status: done ? "already done" : "ok" });
  }
  ctx.log(`${intent.kind === "invoice_send" ? "Sent" : "Reminded"} ${sent.length} invoice${sent.length === 1 ? "" : "s"} through PayPal.`);
  return ok({ ...asObject(ctx.input), sent });
};

// ---------- product checkout (Channel3 -> PayPal) ----------

const checkoutLink: Executor = async (ctx) => {
  const intent = requireApproved(ctx.node.id, ctx.node.type, ctx.config, ctx.input);
  if (intent.kind !== "checkout") throw new NodeError("Unexpected action.");
  const { paypalResources, workflows } = await collections();
  const requestId = idemKey(ctx);
  // A checkout this exact step already created is reused, never duplicated.
  const existing = await paypalResources.findOne({ kind: "order", "detail.checkoutKey": requestId });
  if (existing) {
    return ok({ ...asObject(ctx.input), checkout: { orderId: existing.paypalId, approveUrl: existing.detail.approveUrl ?? null, product: intent.title, price: intent.price, currency: intent.currency, status: existing.status } });
  }
  // The price charged is Channel3's price right now, and it must still be the price approved.
  let current;
  try {
    current = await getProduct(intent.productId);
  } catch (error) {
    throw new NodeError(isAppError(error) ? error.message : "Couldn't re-check the product price with Channel3.");
  }
  const now = current.price ? toPaypalValue(toMinor(current.price)) : null;
  if (now !== intent.price || (current.currency ?? "").toUpperCase() !== intent.currency) {
    throw new NodeError(`The price changed since approval (${intent.price} ${intent.currency} to ${now ?? "unavailable"} ${current.currency ?? ""}). No checkout was created; re-run to approve the new price.`);
  }
  if (current.availability && current.availability !== "InStock") throw new NodeError("The product went out of stock after approval. No checkout was created.");
  const workflow = await workflows.findOne({ _id: ctx.run.workflowId }, { projection: { webhookKey: 1 } });
  const base = env().APP_URL;
  const order = await call(() =>
    paypal.createOrder({
      currency: intent.currency as Allocation["currency"],
      amountMinor: toMinor(intent.price),
      itemName: intent.title,
      description: [intent.note, intent.merchant].filter(Boolean).join(" - ") || "Product checkout",
      customId: referenceFor(workflow?.webhookKey ?? "unknown-workflow-key"),
      requestId,
      redirect: { returnUrl: `${base}/pay/done?status=approved`, cancelUrl: `${base}/pay/done?status=cancelled`, brandName: "Money Lego (sandbox)" },
    }),
  );
  const approveUrl = paypal.approveLink(order);
  await recordResource({
    kind: "order",
    paypalId: order.id,
    status: order.status,
    amount: { currency_code: intent.currency, value: intent.price },
    counterparty: intent.merchant,
    detail: { source: "channel3", channel3Id: intent.productId, product: intent.title.slice(0, 120), checkoutKey: requestId, approveUrl, sideEffect: true },
    owner: owner(ctx),
  });
  ctx.log(`PayPal checkout ${order.id} created for ${intent.title.slice(0, 60)} at ${intent.price} ${intent.currency}. Waiting for the buyer.`);
  return ok({ ...asObject(ctx.input), checkout: { orderId: order.id, approveUrl, product: intent.title, price: intent.price, currency: intent.currency, status: order.status } });
};

const waitCheckout: Executor = async (ctx) => {
  const orderId = text(asObject(asObject(ctx.input).checkout).orderId, 40);
  if (!/^[A-Z0-9]{6,40}$/i.test(orderId)) throw new NodeError("No checkout to follow. Connect this after PayPal checkout link.");
  let order = await call(() => paypal.getOrder(orderId));
  // The buyer approved on PayPal: capture now, once (the request id makes a retry return the same capture).
  if (order.status === "APPROVED") {
    try {
      order = await paypal.captureOrder(orderId, `ml-cap-${orderId}`);
    } catch (error) {
      if (error instanceof PaypalError && error.issue === "ORDER_ALREADY_CAPTURED") order = await call(() => paypal.getOrder(orderId));
      else throw new NodeError(isAppError(error) ? error.message : "PayPal couldn't capture the payment.");
    }
  }
  await recordResource({ kind: "order", paypalId: order.id, status: order.status });
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.status === "COMPLETED" && capture) {
    await recordResource({ kind: "capture", paypalId: capture.id, status: capture.status, amount: capture.amount, counterparty: maskEmail(order.payer?.email_address), detail: { orderId: order.id, source: "channel3" }, owner: owner(ctx) });
    if (capture.status !== "COMPLETED") ctx.log(`PayPal reports the capture as ${capture.status}.`, "warn");
    return ok({ ...asObject(ctx.input), purchase: { orderId: order.id, captureId: capture.id, status: capture.status, amount: capture.amount?.value ?? null, currency: capture.amount?.currency_code ?? null } });
  }
  const notPaid = (reason: string) => {
    const handled = ctx.run.graph.edges.some((e) => e.source === ctx.node.id && e.sourcePort === "failed");
    if (handled) return ok({ ...asObject(ctx.input), purchase: { orderId, status: order.status, failure: reason } }, "failed");
    throw new NodeError(reason);
  };
  if (order.status === "VOIDED") return notPaid("The checkout was cancelled or expired. Nothing was charged.");
  const until = ctx.waitState?.until ? new Date(String(ctx.waitState.until)) : new Date(Date.now() + Number(ctx.config.timeoutHours ?? 72) * 3_600_000);
  if (until.getTime() <= Date.now()) return notPaid("The buyer didn't pay within the time limit. Nothing was charged.");
  return { kind: "wait", wait: { kind: "provider", until, ref: `order:${orderId}` }, state: { until: until.toISOString(), lastStatus: order.status } };
};

export const paypalExecutors: Record<string, Executor> = {
  "paypal.checkout_link": checkoutLink,
  "paypal.wait_checkout": waitCheckout,
  "data.allocate": async (ctx) => ok({ ...asObject(ctx.input), allocation: allocate(ctx.config) }),
  "paypal.get_order": getOrder,
  "paypal.find_invoices": findInvoices,
  "paypal.create_invoice": createInvoice,
  "paypal.get_subscription": getSubscription,
  "paypal.transactions": transactions,
  "paypal.payout": payout,
  "paypal.payout_status": payoutStatus,
  "paypal.refund": refund,
  "paypal.send_invoice": sendInvoice,
};
