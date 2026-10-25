import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const g = graph(
  [
    { id: "shopify", type: "trigger.shopify", label: "Order paid", at: [0, 0] },
    { id: "paid", type: "logic.filter", label: "Paid in full", at: [1, 0], config: { left: "{{ input.order.financialStatus }}", operator: "equals", right: "paid" } },
    { id: "active", type: "logic.filter", label: "Not cancelled", at: [2, 0], config: { left: "{{ input.order.cancelled }}", operator: "equals", right: "false" } },
    {
      id: "supplier",
      type: "airtable.lookup",
      label: "Approved supplier terms",
      at: [0, 1],
      config: { baseId: "", table: "Suppliers", matchField: "sku", matchValue: "{{ trigger.order.skus[0] }}", statusField: "payout_status", statusValue: "approved", maxRecords: 1 },
    },
    { id: "once", type: "logic.once", label: "One payout per order", at: [1, 1], config: { key: "shopify-order:{{ trigger.order.id }}:{{ input.records[0].id }}" } },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Validate payout",
      at: [2, 1],
      config: { rows: "{{ input.rows }}", tokenMint: usdcMint(), walletField: "wallet", amountField: "token_amount", labelField: "supplier", maxTotal: "" },
    },
    ...payoutSteps([0, 2], "Order {{ trigger.order.name }} on {{ trigger.shop }}: pay {{ input.amount }} {{ input.symbol }} to the approved supplier from your separately funded Solana wallet. Shopify's fiat payout is not involved."),
    { id: "result", type: "mh.result", label: "Transfer summary", at: [5, 2] },
    { id: "slack", type: "notify.slack", label: "Notify Slack", at: [5, 3], config: { message: "Supplier payout for order {{ trigger.order.name }} is {{ input.state }}: {{ input.amount }}. Run {{ run.id }}. Receipt: {{ input.receiptUrl }}" } },
  ],
  [["shopify", "paid"], ["paid", "active"], ["active", "supplier"], ["supplier", "once"], ["once", "allocate"], ...payoutEdges("allocate"), ["wait", "result"], ["wait", "result", "failed"], ["result", "slack"]],
);

export const shopifyApprovedSupplierPayout: TemplateDefinition = {
  slug: "shopify-approved-supplier-payout",
  name: "Shopify Supplier Payout",
  shortDescription: "Use a verified paid-order event to prepare a reviewed payout to the configured supplier.",
  fullDescription:
    "When your connected store reports an order as paid, Money Lego verifies Shopify's signature, checks the order is paid and not cancelled, looks up the supplier's approved terms in Airtable and prepares a USDC payout from a separate, pre-funded Solana wallet. You review and sign every payout; the result goes to Slack. Each order pays its supplier at most once, even if Shopify redelivers the event.",
  useCase:
    "Merchants who settle with dropship or print-on-demand suppliers in USDC reconcile orders against a supplier list by hand. This ties each payout to a verified order and an approved supplier record, and keeps a person in the loop for every transfer.",
  howItWorks: [
    "Shopify sends orders/paid with an HMAC over the raw body. Only events from your shop domain are accepted, and each event id runs once.",
    "The order must be fully paid and not cancelled.",
    "Airtable returns the supplier record for the order's SKU, only if payout_status is approved.",
    "The order and supplier pair is claimed, so no second payout can start for it.",
    "The wallet and token amount are validated exactly as written in Airtable. No fiat conversion happens.",
    "MultiHopper quotes the transfer, you review it, approve and sign in your wallet.",
    "Money Lego tracks delivery and posts the outcome to Slack.",
  ],
  category: "Commerce",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 15, max: 20 },
  integrations: ["shopify", "airtable", "multihopper", "slack"],
  tags: ["commerce", "suppliers", "orders", "usdc"],
  thumbnailAlt: "Workflow diagram: a Shopify paid order passes paid and not-cancelled checks, an Airtable supplier lookup and a once-per-order guard, then a MultiHopper quote, operator review, wallet authorization and a Slack notification.",
  graphDefinition: g,
  exampleScenario: {
    headline: "Order #1042 is paid and its supplier's approved payout is prepared",
    narrative:
      "Shopify reports shopify_order_demo_1042 as paid. Airtable has an approved supplier row for the order's SKU with a token amount and wallet the merchant configured. Money Lego prepares a quote from the merchant's own USDC wallet and waits for review. The amount and wallet below are placeholders; nothing here can be paid.",
    sampleInput: { topic: "orders/paid", shop: "example-store.myshopify.com", order: { id: "shopify_order_demo_1042", name: "#1042", financialStatus: "paid", cancelled: false, currency: "USD", skus: ["MUG-BLUE"] } },
    expectedStepOutputs: [
      { nodeId: "shopify", label: "Verified order event", exampleOutput: { order: { id: "shopify_order_demo_1042", financialStatus: "paid", cancelled: false } } },
      { nodeId: "supplier", label: "Approved supplier terms", exampleOutput: { record: { supplier: "Example Supplier", sku: "MUG-BLUE", payout_status: "approved", token_amount: "{{configure_amount}}", wallet: "{{configure_wallet}}" } } },
      { nodeId: "once", label: "Order claimed", exampleOutput: { onceKey: "shopify-order:shopify_order_demo_1042:rec…" } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["order #1042", "source wallet", "supplier wallet", "amount", "fee"] } },
    ],
    safetyNotes: [
      "Example only, a dry run. No funds move.",
      "A paid Shopify order does not put money in a Solana wallet. Payouts come from a wallet you fund separately.",
      "The USDC amount comes from Airtable as written. It is never derived from the order's fiat total.",
    ],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "shopify", status: "would_run", note: "HMAC verified; event id stored so a redelivery is ignored." },
      { nodeId: "supplier", status: "would_run", note: "Finds one approved supplier record." },
      { nodeId: "allocate", status: "would_stop", note: "Stops until the record has a real wallet and amount." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "shopify", title: "Connect your store", detail: "Enter your-store.myshopify.com and approve read-only order access. The order-paid webhook is registered for you.", nodeIds: ["shopify"] },
    { id: "airtable", title: "Sign in with Airtable", detail: "Allow access to the supplier base and set its ID. Fields: sku, supplier, wallet, token_amount, payout_status.", nodeIds: ["supplier"] },
    { id: "rules", title: "Check the payout rules", detail: "Confirm the field names and set a spending cap per order.", nodeIds: ["allocate"] },
    { id: "slack", title: "Add to Slack", detail: "Pick the channel for payout updates on Slack's screen.", nodeIds: ["slack"] },
    { id: "wallet", title: "Fund the payout wallet", detail: "Keep USDC and some SOL in the wallet you sign with. It is separate from Shopify's settlement.", nodeIds: ["sign"] },
  ],
  safetyNotes: [
    "Shopify's fiat settlement never reaches Solana through this workflow. Fund the payout wallet yourself.",
    "Every payout waits for your approval and wallet signature.",
    "Each order and supplier pair pays once, even when Shopify retries the webhook.",
  ],
};
