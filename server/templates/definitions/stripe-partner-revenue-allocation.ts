import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const allocationBody = JSON.stringify(
  {
    invoiceId: "{{ trigger.invoice.id }}",
    amountPaid: "{{ trigger.invoice.amountPaid }}",
    currency: "{{ trigger.invoice.currency }}",
    policyPageId: "{{ input.policy.pageId }}",
    policyVersion: "{{ input.policy.version }}",
  },
  null,
  2,
);

const g = graph(
  [
    { id: "stripe", type: "trigger.stripe", label: "Invoice paid", at: [0, 0], config: { eventType: "invoice.paid" } },
    { id: "check", type: "logic.filter", label: "Invoice status is paid", at: [1, 0], config: { left: "{{ input.invoice.status }}", operator: "equals", right: "paid" } },
    { id: "once", type: "logic.once", label: "One allocation per invoice", at: [2, 0], config: { key: "stripe-invoice:{{ trigger.invoice.id }}" } },
    { id: "policy", type: "notion.get_page", label: "Partner payout policy", at: [3, 0], config: { pageId: "" } },
    {
      id: "allocation",
      type: "http.request",
      label: "Allocation service",
      at: [4, 0],
      config: {
        method: "POST",
        url: "",
        allowedHost: "",
        body: allocationBody,
        timeoutSeconds: 10,
        responseRules: [
          { path: "body.recipients", type: "array" },
          { path: "body.total", type: "string" },
        ],
      },
    },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Validate split",
      at: [5, 0],
      config: { rows: "{{ input.body.recipients }}", tokenMint: usdcMint(), walletField: "wallet", amountField: "amount", labelField: "partner", expectedTotal: "{{ input.body.total }}", maxTotal: "" },
    },
    ...payoutSteps([1, 1], "Invoice {{ trigger.invoice.id }} under policy {{ nodes.policy.policy.title }} ({{ nodes.policy.policy.version }}): pay {{ input.amount }} {{ input.symbol }} to {{ input.destinations.length }} partners from your separately funded wallet."),
    { id: "result", type: "mh.result", label: "Transfer summary", at: [6, 1] },
    { id: "slack", type: "notify.slack", label: "Notify Slack", at: [6, 2], config: { message: "Partner allocation for invoice {{ trigger.invoice.id }} is {{ input.state }}: {{ input.amount }} to {{ input.recipients }} partners. Run {{ run.id }}." } },
    {
      id: "record",
      type: "notion.create_page",
      label: "Record in Notion",
      at: [5, 2],
      config: { databaseId: "", titleProperty: "Name", title: "Invoice {{ trigger.invoice.id }}: {{ input.state }}", summary: "Run {{ run.id }}. {{ input.amount }} to {{ input.recipients }} partners. Receipt: {{ input.receiptUrl }}" },
    },
  ],
  [["stripe", "check"], ["check", "once"], ["once", "policy"], ["policy", "allocation"], ["allocation", "allocate"], ...payoutEdges("allocate"), ["wait", "result"], ["wait", "result", "failed"], ["result", "slack"], ["slack", "record"]],
);

export const stripePartnerRevenueAllocation: TemplateDefinition = {
  slug: "stripe-partner-revenue-allocation",
  name: "Stripe Partner Revenue Allocation",
  shortDescription: "Use a verified invoice event, a documented payout policy and an internal allocation service to prepare partner payouts.",
  fullDescription:
    "A verified Stripe invoice.paid event starts the run. Money Lego reads the partner payout policy page you chose in Notion, asks your own allocation service how to split the payout, validates the answer to the last base unit and prepares a MultiHopper transfer from your separately funded wallet. You review and sign. The outcome goes to Slack and a Notion record.",
  useCase:
    "Revenue-share programs pay resellers, affiliates or co-sellers a cut of paid invoices. The split logic usually lives in an internal service and the policy in a doc. This connects the two to a reviewed, signed payout and leaves a record for finance.",
  howItWorks: [
    "Your connected Stripe account's invoice.paid arrives through Money Lego's verified Stripe Connect endpoint, with a 5 minute timestamp window. Each event id runs once.",
    "The invoice must actually be paid.",
    "The invoice is claimed, so a second allocation for it can't start.",
    "Notion returns the policy page you picked and its last edit time as the policy version. Nothing interprets the policy automatically.",
    "Your allocation service, at a host you allow, returns recipients and a total. The response shape is checked.",
    "The split is validated: distinct wallets, positive amounts, and a sum that matches the total exactly.",
    "MultiHopper quotes it, you review, approve and sign in your wallet.",
    "The outcome is posted to Slack and recorded in Notion.",
  ],
  category: "Revenue Operations",
  difficulty: "Advanced",
  estimatedSetupMinutes: { min: 20, max: 30 },
  integrations: ["stripe", "notion", "http", "multihopper", "slack"],
  tags: ["revenue share", "partners", "invoices", "usdc"],
  thumbnailAlt: "Workflow diagram: a Stripe invoice paid event passes a status check and once-per-invoice guard, reads a Notion policy, calls an allocation service over HTTP, validates the split, then MultiHopper quote, operator review, wallet authorization, Slack and a Notion record.",
  graphDefinition: g,
  exampleScenario: {
    headline: "Invoice in_demo_2048 is paid and two partners' shares are prepared",
    narrative:
      "Stripe reports invoice in_demo_2048 as paid. The policy page is at version 2026-10-01. A local test adapter standing in for the allocation service returns two partners, 70 and 30 USDC of a 100 USDC total. Money Lego validates the split and waits for review. These values are fake, and the wallets are placeholders.",
    sampleInput: { type: "invoice.paid", eventId: "evt_demo_2048", invoice: { id: "in_demo_2048", status: "paid", amountPaid: 100000, currency: "usd" } },
    expectedStepOutputs: [
      { nodeId: "stripe", label: "Verified invoice event", exampleOutput: { invoice: { id: "in_demo_2048", status: "paid" } } },
      { nodeId: "policy", label: "Policy reference", exampleOutput: { policy: { title: "Partner Payout Policy — Demo", version: "2026-10-01T00:00:00.000Z" } } },
      {
        nodeId: "allocation",
        label: "Allocation service answer (test adapter)",
        exampleOutput: {
          status: 200,
          body: {
            total: "100",
            recipients: [
              { partner: "Partner A", wallet: "{{configure_wallet}}", amount: "70" },
              { partner: "Partner B", wallet: "{{configure_wallet}}", amount: "30" },
            ],
          },
        },
      },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["invoice", "policy version", "2 partners", "fee"] } },
    ],
    safetyNotes: [
      "Example only, a dry run. No funds move and no service was called.",
      "A paid invoice is a business signal. Stripe funds never reach Solana through this workflow; pay from a wallet you fund.",
      "The allocation endpoint is yours to configure. No production URL or credential ships with the template.",
    ],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "stripe", status: "would_run", note: "Signature and timestamp verified; event id stored." },
      { nodeId: "allocation", status: "would_run", note: "Calls your service with a 10 second timeout." },
      { nodeId: "allocate", status: "would_stop", note: "Stops until real wallets come back from your service." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "stripe", title: "Connect with Stripe", detail: "Approve read-only access. Invoice events then arrive automatically; nothing to paste.", nodeIds: ["stripe"] },
    { id: "policy", title: "Pick the policy page", detail: "Connect Notion, share the policy page with Money Lego on Notion's screen and set its ID.", nodeIds: ["policy"] },
    { id: "service", title: "Point at your allocation service", detail: "Set the HTTPS URL and allowed host, plus an auth header credential. It must return { total, recipients: [{ partner, wallet, amount }] } in whole USDC.", nodeIds: ["allocation"] },
    { id: "rules", title: "Check the split rules", detail: "Set a spending cap per invoice.", nodeIds: ["allocate"] },
    { id: "notify", title: "Connect Slack and Notion", detail: "Add to Slack for results; connect Notion and pick the records database.", nodeIds: ["slack", "record"] },
  ],
  safetyNotes: [
    "Money Lego never receives or converts Stripe funds.",
    "Every payout waits for your approval and wallet signature.",
    "Each invoice is allocated once, even when Stripe retries the event.",
  ],
};
