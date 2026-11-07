import { AmountError, fromRaw, toRaw } from "../amounts";

// Shared by the canvas, the engine and the dashboard. Money is integer minor units held as
// strings (bigint in arithmetic) plus an ISO currency code. PayPal expects decimal strings
// with the currency's own precision, so conversion happens only at the API boundary.

// Two-decimal currencies PayPal supports for Orders, Payouts and Invoicing. Zero-decimal
// ones (JPY, HUF, TWD) are left out on purpose so every amount uses the same precision.
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_DECIMALS = 2;

export const isCurrency = (value: unknown): value is Currency => typeof value === "string" && (CURRENCIES as readonly string[]).includes(value.toUpperCase());

export function toMinor(amount: string, what = "Amount"): bigint {
  try {
    return toRaw(String(amount ?? "").trim(), CURRENCY_DECIMALS);
  } catch (error) {
    throw new AmountError(`${what}: ${error instanceof AmountError ? error.message.replace("This token supports", "Use") : "enter a number like 12.50"}`);
  }
}

// PayPal's own format: always two decimals, e.g. "70.00".
export function toPaypalValue(minor: bigint | string): string {
  const plain = fromRaw(minor, CURRENCY_DECIMALS);
  const [whole, fraction = ""] = plain.split(".");
  return `${whole}.${fraction.padEnd(CURRENCY_DECIMALS, "0")}`;
}

export function formatMoney(minor: bigint | string | null | undefined, currency: string | null | undefined): string {
  if (minor === null || minor === undefined || minor === "") return "—";
  const value = toPaypalValue(minor);
  const [whole, fraction] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction} ${currency ?? ""}`.trim();
}

export type PaypalResourceKind = "order" | "capture" | "refund" | "payout_batch" | "payout_item" | "invoice" | "subscription";

// Webhook events Money Lego subscribes to and can route to a workflow.
export const PAYPAL_EVENTS = [
  { value: "PAYMENT.CAPTURE.COMPLETED", label: "Payment captured" },
  { value: "PAYMENT.CAPTURE.PENDING", label: "Payment pending" },
  { value: "PAYMENT.CAPTURE.DENIED", label: "Payment denied" },
  { value: "PAYMENT.CAPTURE.REFUNDED", label: "Payment refunded" },
  { value: "CHECKOUT.ORDER.APPROVED", label: "Checkout approved by buyer" },
  { value: "INVOICING.INVOICE.PAID", label: "Invoice paid" },
  { value: "INVOICING.INVOICE.CANCELLED", label: "Invoice cancelled" },
  { value: "BILLING.SUBSCRIPTION.PAYMENT.FAILED", label: "Subscription payment failed" },
  { value: "BILLING.SUBSCRIPTION.CANCELLED", label: "Subscription cancelled" },
  { value: "CUSTOMER.DISPUTE.CREATED", label: "Dispute opened" },
  { value: "PAYMENT.PAYOUTSBATCH.SUCCESS", label: "Payout batch succeeded" },
  { value: "PAYMENT.PAYOUTSBATCH.DENIED", label: "Payout batch denied" },
  { value: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", label: "Payout item succeeded" },
  { value: "PAYMENT.PAYOUTS-ITEM.FAILED", label: "Payout item failed" },
  { value: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", label: "Payout item unclaimed" },
] as const;

export const PAYPAL_EVENT_TYPES: string[] = PAYPAL_EVENTS.map((e) => e.value);

// The Money Lego reference stamped on objects we create (custom_id on orders, reference on
// invoices), so an incoming event can be routed to exactly one workflow.
export const referenceFor = (workflowKey: string) => `ml:${workflowKey}`;
export const keyFromReference = (reference: string | null | undefined): string | null => {
  const match = /^ml:([A-Za-z0-9_-]{16,64})$/.exec(String(reference ?? ""));
  return match ? match[1] : null;
};

// Payout batch statuses that won't change any more (PayPal docs: Payouts batch_status).
export const PAYOUT_BATCH_FINAL = ["SUCCESS", "DENIED", "CANCELED"];
// Item statuses that mean the money did not land with the recipient (yet).
export const PAYOUT_ITEM_PROBLEM = ["FAILED", "RETURNED", "BLOCKED", "REFUNDED", "REVERSED", "DENIED", "CANCELED"];

// The safe shape of an allocation, produced by data.allocate and consumed by paypal.payout.
export interface AllocationItem {
  receiver: string;
  amountMinor: string;
  label: string;
  // Kept by the merchant (e.g. an operations reserve): calculated and shown, never paid out.
  keep: boolean;
}

export interface Allocation {
  currency: Currency;
  totalMinor: string;
  total: string;
  items: AllocationItem[];
  // What leaves the business: every non-reserve share.
  payoutMinor: string;
  payout: string;
}
