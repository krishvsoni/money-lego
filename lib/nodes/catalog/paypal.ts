import { CURRENCIES } from "../../paypal/types";
import { MAIN_IN, MAIN_OUT, type ConfigIssue, type NodeDefinition } from "../types";

// PayPal actions. Reads (order, subscription, invoices, transactions) run freely. Anything
// that moves money or messages a customer (payout, refund, invoice send/remind) is marked
// sideEffect: it must sit directly on a Human approval's Approved output, the approval shows
// exactly what it will do, and the node refuses to act if that changed since approval.
// Every write carries an idempotency key derived from the run and node, so a retry finds
// PayPal's first result instead of paying twice.

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invoiceIssues(config: Record<string, unknown>): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const email = String(config.recipientEmail ?? "").trim();
  if (email && !email.includes("{{") && !EMAIL.test(email)) issues.push({ field: "recipientEmail", message: "Enter an email address" });
  const amount = String(config.amount ?? "").trim();
  if (amount && !amount.includes("{{") && !/^\d{1,7}(\.\d{1,2})?$/.test(amount)) issues.push({ field: "amount", message: "Use an amount like 250 or 250.00" });
  return issues;
}

export const paypalNodes: NodeDefinition[] = [
  {
    type: "paypal.checkout_link",
    summary: "Create a PayPal checkout for a chosen product.",
    title: "PayPal checkout link",
    category: "paypal",
    provider: "paypal",
    sideEffect: true,
    description:
      "Create a PayPal order for the product picked earlier (from Channel3) at its current price, and return the link the buyer opens to pay. The price is re-read from Channel3 when the order is created; if it changed since you approved, nothing is created. The buyer still approves the payment on PayPal.",
    icon: "ShoppingCart",
    fields: [
      { key: "productId", label: "Product", kind: "text", required: true, expression: true, placeholder: "{{ input.pick.id }}" },
      { key: "note", label: "Line on the checkout", kind: "text", expression: true, maxLength: 120, placeholder: "Sourced for {{ trigger.client }}" },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { productId: "{{ input.pick.id }}" },
    retrySafe: true,
    outputHint: "The input plus { checkout: { orderId, approveUrl, product, price, currency, status } }.",
  },
  {
    type: "paypal.wait_checkout",
    summary: "Wait for the buyer to pay, then capture.",
    title: "Wait for buyer & capture",
    category: "paypal",
    provider: "paypal",
    description:
      "Pause until the buyer approves the PayPal checkout, then capture the payment (once, even if retried). PayPal's CHECKOUT.ORDER.APPROVED webhook wakes it immediately; it also re-checks on its own. A cancelled or expired checkout goes down Not paid when something is connected there.",
    icon: "Radar",
    fields: [{ key: "timeoutHours", label: "Give up after (hours)", kind: "number", min: 1, max: 720, required: true }],
    inputs: MAIN_IN,
    outputs: [
      { id: "main", label: "Paid" },
      { id: "failed", label: "Not paid" },
    ],
    defaults: { timeoutHours: 72 },
    retrySafe: true,
    outputHint: "The input plus { purchase: { orderId, captureId, status, amount, currency } }.",
  },
  {
    type: "paypal.get_order",
    summary: "Load a PayPal order and its capture.",
    title: "Get PayPal order",
    category: "paypal",
    provider: "paypal",
    description: "Fetch the order from PayPal and confirm its state, amount and capture, instead of trusting what arrived with the event.",
    icon: "logo:paypal",
    fields: [
      { key: "orderId", label: "Order ID", kind: "text", required: true, expression: true, placeholder: "{{ trigger.orderId }}" },
      { key: "requireCompleted", label: "Require a completed capture", kind: "boolean", help: "Stop the run unless PayPal reports the capture COMPLETED." },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { orderId: "{{ trigger.orderId }}", requireCompleted: true },
    retrySafe: true,
    outputHint: "The input plus { order: { id, status, captureId, captureStatus, currency, amount, amountMinor, fee, net, netMinor } }.",
  },
  {
    type: "paypal.payout",
    summary: "Send a PayPal payout batch to the allocation.",
    title: "PayPal payout",
    category: "paypal",
    provider: "paypal",
    sideEffect: true,
    description:
      "Send one PayPal Payouts batch paying every non-reserve recipient of the allocation from the previous step, by email. Needs the Payouts feature on the PayPal app. The batch id is stable per run, so a retry can never create a second batch. A created batch is not yet paid: follow it with Payout status.",
    icon: "logo:paypal",
    fields: [
      { key: "subject", label: "Email subject", kind: "text", required: true, expression: true, maxLength: 200 },
      { key: "note", label: "Note to recipients", kind: "textarea", expression: true, maxLength: 500 },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { subject: "You have a payout from {{ trigger.payer.id }}", note: "Your share for order {{ trigger.orderId }}." },
    retrySafe: true,
    outputHint: "The input plus { payout: { batchId, senderBatchId, status, currency, totalMinor, items } }.",
  },
  {
    type: "paypal.payout_status",
    summary: "Wait until a payout batch settles.",
    title: "Payout status",
    category: "paypal",
    provider: "paypal",
    description:
      "Wait until PayPal reports the payout batch finished (SUCCESS, DENIED or CANCELED), checking item by item. Webhooks wake it immediately; it also re-checks on its own. Items that failed, were returned or are unclaimed go down Problem when something is connected there.",
    icon: "Radar",
    fields: [{ key: "timeoutHours", label: "Give up after (hours)", kind: "number", min: 1, max: 720, required: true }],
    inputs: MAIN_IN,
    outputs: [
      { id: "main", label: "Paid" },
      { id: "failed", label: "Problem" },
    ],
    defaults: { timeoutHours: 48 },
    retrySafe: true,
    outputHint: "The input plus { payoutStatus: { batchId, status, paid, problems, items: [{ receiver, amount, status }] } }.",
  },
  {
    type: "paypal.refund",
    summary: "Refund a captured payment.",
    title: "Refund payment",
    category: "paypal",
    provider: "paypal",
    sideEffect: true,
    description: "Refund a PayPal capture in full, or partially when an amount is set. The refund is idempotent per run, and the approval shows the exact capture and amount.",
    icon: "logo:paypal",
    fields: [
      { key: "captureId", label: "Capture ID", kind: "text", required: true, expression: true, placeholder: "{{ trigger.captureId }}" },
      { key: "amount", label: "Amount", kind: "text", expression: true, placeholder: "Empty = full refund", help: "Decimal amount in the capture's currency." },
      { key: "currency", label: "Currency", kind: "select", options: currencyOptions, help: "Needed only for a partial refund." },
      { key: "note", label: "Note to buyer", kind: "textarea", expression: true, maxLength: 255 },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { captureId: "{{ trigger.captureId }}", currency: "USD" },
    retrySafe: true,
    outputHint: "The input plus { refund: { id, status, captureId, amount, currency } }.",
  },
  {
    type: "paypal.find_invoices",
    summary: "Find unpaid or overdue PayPal invoices.",
    title: "Find invoices",
    category: "paypal",
    provider: "paypal",
    description: "Search your PayPal invoices by status, optionally only those past their due date. Returns facts only; nothing is changed.",
    icon: "logo:paypal",
    fields: [
      {
        key: "status",
        label: "Status",
        kind: "select",
        required: true,
        options: [
          { value: "UNPAID", label: "Sent, unpaid or partly paid" },
          { value: "DRAFT", label: "Drafts" },
          { value: "PAID", label: "Paid" },
        ],
      },
      { key: "overdueOnly", label: "Only past due", kind: "boolean" },
      { key: "limit", label: "At most", kind: "number", min: 1, max: 20, required: true },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { status: "UNPAID", overdueOnly: true, limit: 10 },
    retrySafe: true,
    outputHint: "The input plus { invoices: [{ id, number, status, dueDate, daysOverdue, currency, amount, due, recipient }], invoiceCount }.",
  },
  {
    type: "paypal.create_invoice",
    summary: "Create a draft PayPal invoice.",
    title: "Create invoice",
    category: "paypal",
    provider: "paypal",
    description: "Create a draft invoice in PayPal. Drafts are not sent to anyone; use Send invoice after an approval to deliver it.",
    icon: "logo:paypal",
    fields: [
      { key: "recipientEmail", label: "Bill to (email)", kind: "text", required: true, expression: true, placeholder: "client@example.com" },
      { key: "recipientName", label: "Client name", kind: "text", expression: true, maxLength: 120 },
      { key: "itemName", label: "Item", kind: "text", required: true, expression: true, maxLength: 200 },
      { key: "amount", label: "Amount", kind: "text", required: true, expression: true, placeholder: "250.00" },
      { key: "currency", label: "Currency", kind: "select", required: true, options: currencyOptions },
      { key: "dueInDays", label: "Due in (days)", kind: "number", min: 0, max: 120, required: true },
      { key: "note", label: "Note", kind: "textarea", expression: true, maxLength: 1000 },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { currency: "USD", dueInDays: 14 },
    retrySafe: true,
    outputHint: "The input plus { invoice: { id, number, status, currency, amount, dueDate } } and invoices: [that invoice].",
    validate: invoiceIssues,
  },
  {
    type: "paypal.send_invoice",
    summary: "Send invoices or reminders through PayPal.",
    title: "Send invoice",
    category: "paypal",
    provider: "paypal",
    sideEffect: true,
    description:
      "Send draft invoices, or reminders for sent ones, through PayPal's own email. Works on the invoices list from the previous step (up to 10). When AI drafted a message per invoice, each invoice gets its own note.",
    icon: "Send",
    fields: [
      {
        key: "mode",
        label: "Action",
        kind: "select",
        required: true,
        options: [
          { value: "remind", label: "Send a reminder" },
          { value: "send", label: "Send the invoice" },
        ],
      },
      { key: "subject", label: "Subject", kind: "text", required: true, expression: true, maxLength: 200 },
      { key: "note", label: "Default note", kind: "textarea", expression: true, maxLength: 1000, help: "Used when an invoice has no AI-drafted message." },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { mode: "remind", subject: "Friendly reminder: invoice {{ input.invoices[0].number }}", note: "" },
    retrySafe: true,
    outputHint: "The input plus { sent: [{ invoiceId, action, status }] }.",
  },
  {
    type: "paypal.get_subscription",
    summary: "Load a PayPal subscription's billing state.",
    title: "Get subscription",
    category: "paypal",
    provider: "paypal",
    description: "Fetch a subscription's status, plan, failed payment count, outstanding balance and last failed payment reason from PayPal.",
    icon: "logo:paypal",
    fields: [{ key: "subscriptionId", label: "Subscription ID", kind: "text", required: true, expression: true, placeholder: "{{ trigger.resourceId }}" }],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { subscriptionId: "{{ trigger.resourceId }}" },
    retrySafe: true,
    outputHint: "The input plus { subscription: { id, status, planId, failedPayments, outstanding, currency, lastFailedReason, nextBillingTime } }.",
  },
  {
    type: "paypal.transactions",
    summary: "Summarise recent PayPal transactions.",
    title: "Transaction report",
    category: "paypal",
    provider: "paypal",
    description: "Read recent transactions with PayPal's Transaction Search API and total them by status. Sandbox transactions can take a few hours to appear there.",
    icon: "logo:paypal",
    fields: [{ key: "days", label: "Look back (days)", kind: "number", min: 1, max: 31, required: true }],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { days: 7 },
    retrySafe: true,
    outputHint: "The input plus { report: { from, to, count, byStatus: { S: { count, totals } }, transactions: [...] } }.",
  },
];
