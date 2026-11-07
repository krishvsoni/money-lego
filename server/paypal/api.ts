import "server-only";
import { toPaypalValue, type Currency } from "@/lib/paypal/types";
import { paypalRequest } from "./client";

// Typed wrappers for the documented PayPal REST endpoints Money Lego uses. Each returns
// only the fields we read; PayPal's full objects never travel further than this file's
// callers, which store a short summary.
//
// Orders v2        https://developer.paypal.com/docs/api/orders/v2/
// Payments v2      https://developer.paypal.com/docs/api/payments/v2/
// Payouts v1       https://developer.paypal.com/docs/api/payments.payouts-batch/v1/
// Invoicing v2     https://developer.paypal.com/docs/api/invoicing/v2/
// Subscriptions v1 https://developer.paypal.com/docs/api/subscriptions/v1/
// Transaction search https://developer.paypal.com/docs/api/transaction-search/v1/
// Webhooks v1      https://developer.paypal.com/docs/api/webhooks/v1/

export interface Money {
  currency_code: string;
  value: string;
}

const money = (currency: Currency | string, minor: bigint | string): Money => ({ currency_code: currency, value: toPaypalValue(minor) });

// ---------- Orders & captures ----------

export interface CaptureObject {
  id: string;
  status: string;
  amount?: Money;
  custom_id?: string;
  invoice_id?: string;
  final_capture?: boolean;
  seller_receivable_breakdown?: { gross_amount?: Money; paypal_fee?: Money; net_amount?: Money };
  supplementary_data?: { related_ids?: { order_id?: string } };
  status_details?: { reason?: string };
  create_time?: string;
}

export interface OrderObject {
  id: string;
  status: string;
  intent?: string;
  payer?: { payer_id?: string; email_address?: string; name?: { given_name?: string; surname?: string }; address?: { country_code?: string } };
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    description?: string;
    amount?: Money;
    payments?: { captures?: CaptureObject[]; refunds?: Array<{ id: string; status: string; amount?: Money }> };
  }>;
  links?: Array<{ rel: string; href: string }>;
  create_time?: string;
}

export function createOrder(input: { currency: Currency; amountMinor: bigint; itemName: string; description: string; customId: string; requestId: string }): Promise<OrderObject> {
  const value = money(input.currency, input.amountMinor);
  return paypalRequest<OrderObject>({
    path: "/v2/checkout/orders",
    requestId: input.requestId,
    prefer: "return=representation",
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "default",
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { ...value, breakdown: { item_total: value } },
          items: [{ name: input.itemName.slice(0, 127), quantity: "1", unit_amount: value, category: "DIGITAL_GOODS" }],
        },
      ],
    },
  });
}

export const getOrder = (id: string) => paypalRequest<OrderObject>({ path: `/v2/checkout/orders/${encodeURIComponent(id)}` });

export const captureOrder = (id: string, requestId: string) =>
  paypalRequest<OrderObject>({ method: "POST", path: `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, body: {}, requestId, prefer: "return=representation" });

export const getCapture = (id: string) => paypalRequest<CaptureObject>({ path: `/v2/payments/captures/${encodeURIComponent(id)}` });

export interface RefundObject {
  id: string;
  status: string;
  amount?: Money;
  status_details?: { reason?: string };
}

export function refundCapture(input: { captureId: string; currency?: Currency; amountMinor?: bigint | null; note?: string; requestId: string }): Promise<RefundObject> {
  const body: Record<string, unknown> = {};
  if (input.amountMinor && input.currency) body.amount = money(input.currency, input.amountMinor);
  if (input.note) body.note_to_payer = input.note.slice(0, 255);
  return paypalRequest<RefundObject>({ path: `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`, body, requestId: input.requestId, prefer: "return=representation" });
}

// ---------- Payouts ----------

// Payouts uses { value, currency } where the v2 APIs use { currency_code, value }.
export interface PayoutMoney {
  value: string;
  currency: string;
}

export interface PayoutItemObject {
  payout_item_id: string;
  transaction_id?: string;
  transaction_status?: string;
  payout_item_fee?: PayoutMoney;
  payout_item: { receiver: string; amount: PayoutMoney; sender_item_id?: string; note?: string };
  errors?: { name?: string; message?: string };
}

export interface PayoutBatchObject {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    sender_batch_header?: { sender_batch_id?: string };
    amount?: PayoutMoney;
    fees?: PayoutMoney;
    time_created?: string;
    time_completed?: string;
  };
  items?: PayoutItemObject[];
}

export function createPayoutBatch(input: {
  senderBatchId: string;
  currency: Currency;
  subject: string;
  message: string;
  items: Array<{ receiver: string; amountMinor: string; note: string; senderItemId: string }>;
}): Promise<PayoutBatchObject> {
  return paypalRequest<PayoutBatchObject>({
    path: "/v1/payments/payouts",
    // PayPal rejects a sender_batch_id it saw in the last 30 days, and the request id makes a
    // retried request return the first response instead of a second batch.
    requestId: input.senderBatchId,
    body: {
      sender_batch_header: { sender_batch_id: input.senderBatchId, email_subject: input.subject.slice(0, 255), email_message: input.message.slice(0, 1000) },
      items: input.items.map((i) => ({
        recipient_type: "EMAIL",
        amount: { value: toPaypalValue(i.amountMinor), currency: input.currency },
        receiver: i.receiver,
        note: i.note.slice(0, 4000),
        sender_item_id: i.senderItemId.slice(0, 63),
      })),
    },
  });
}

export const getPayoutBatch = (batchId: string) =>
  paypalRequest<PayoutBatchObject>({ path: `/v1/payments/payouts/${encodeURIComponent(batchId)}`, query: { fields: "batch_header,items", page_size: 100, total_required: true } });

// ---------- Invoicing ----------

export interface InvoiceObject {
  id: string;
  status: string;
  detail?: { invoice_number?: string; reference?: string; currency_code?: string; note?: string; invoice_date?: string; payment_term?: { due_date?: string }; metadata?: { recipient_view_url?: string } };
  primary_recipients?: Array<{ billing_info?: { email_address?: string; name?: { given_name?: string; surname?: string; full_name?: string } } }>;
  amount?: Money;
  due_amount?: Money;
}

export function createDraftInvoice(input: {
  currency: Currency;
  recipientEmail: string;
  recipientName: string;
  itemName: string;
  amountMinor: bigint;
  dueDate: string;
  note: string;
  reference: string;
  requestId: string;
}): Promise<InvoiceObject> {
  return paypalRequest<InvoiceObject>({
    path: "/v2/invoicing/invoices",
    requestId: input.requestId,
    prefer: "return=representation",
    body: {
      detail: { currency_code: input.currency, reference: input.reference, note: input.note.slice(0, 4000), payment_term: { due_date: input.dueDate } },
      primary_recipients: [{ billing_info: { email_address: input.recipientEmail, ...(input.recipientName ? { name: { given_name: input.recipientName.slice(0, 140) } } : {}) } }],
      items: [{ name: input.itemName.slice(0, 200), quantity: "1", unit_amount: money(input.currency, input.amountMinor) }],
    },
  });
}

export const getInvoice = (id: string) => paypalRequest<InvoiceObject>({ path: `/v2/invoicing/invoices/${encodeURIComponent(id)}` });

export function sendInvoice(id: string, input: { subject: string; note: string; requestId: string }) {
  return paypalRequest<{ href?: string }>({
    path: `/v2/invoicing/invoices/${encodeURIComponent(id)}/send`,
    requestId: input.requestId,
    body: { subject: input.subject.slice(0, 4000), note: input.note.slice(0, 4000), send_to_invoicer: false, send_to_recipient: true },
  });
}

export function remindInvoice(id: string, input: { subject: string; note: string; requestId: string }) {
  return paypalRequest<Record<string, never>>({
    path: `/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`,
    requestId: input.requestId,
    body: { subject: input.subject.slice(0, 4000), note: input.note.slice(0, 4000), send_to_invoicer: false, send_to_recipient: true },
  });
}

export function searchInvoices(input: { statuses: string[]; dueBefore?: string; pageSize: number }) {
  const body: Record<string, unknown> = { status: input.statuses };
  if (input.dueBefore) body.due_date_range = { start: "2000-01-01", end: input.dueBefore };
  return paypalRequest<{ items?: InvoiceObject[]; total_items?: number }>({ path: "/v2/invoicing/search-invoices", query: { page: 1, page_size: input.pageSize, total_required: true }, body });
}

// ---------- Subscriptions ----------

export interface SubscriptionObject {
  id: string;
  status: string;
  plan_id?: string;
  custom_id?: string;
  status_update_time?: string;
  subscriber?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  billing_info?: {
    outstanding_balance?: Money;
    failed_payments_count?: number;
    next_billing_time?: string;
    last_payment?: { amount?: Money; time?: string };
    last_failed_payment?: { amount?: Money; time?: string; reason_code?: string; next_payment_retry_time?: string };
  };
}

export const getSubscription = (id: string) => paypalRequest<SubscriptionObject>({ path: `/v1/billing/subscriptions/${encodeURIComponent(id)}` });

// ---------- Transaction search ----------

export interface TransactionDetail {
  transaction_info?: {
    transaction_id?: string;
    transaction_event_code?: string;
    transaction_status?: string;
    transaction_amount?: Money;
    fee_amount?: Money;
    transaction_initiation_date?: string;
    custom_field?: string;
  };
}

export function searchTransactions(input: { start: Date; end: Date; pageSize: number }) {
  return paypalRequest<{ transaction_details?: TransactionDetail[]; total_items?: number }>({
    path: "/v1/reporting/transactions",
    query: { start_date: input.start.toISOString().replace(/\.\d{3}Z$/, "Z"), end_date: input.end.toISOString().replace(/\.\d{3}Z$/, "Z"), fields: "transaction_info", page_size: input.pageSize },
  });
}

// ---------- Webhooks ----------

export interface WebhookObject {
  id: string;
  url: string;
  event_types: Array<{ name: string }>;
}

export const listWebhooks = () => paypalRequest<{ webhooks?: WebhookObject[] }>({ path: "/v1/notifications/webhooks" });

export const createWebhook = (url: string, events: string[]) =>
  paypalRequest<WebhookObject>({ path: "/v1/notifications/webhooks", body: { url, event_types: events.map((name) => ({ name })) } });

export const updateWebhookEvents = (id: string, events: string[]) =>
  paypalRequest<WebhookObject>({ method: "PATCH", path: `/v1/notifications/webhooks/${encodeURIComponent(id)}`, body: [{ op: "replace", path: "/event_types", value: events.map((name) => ({ name })) }] });
