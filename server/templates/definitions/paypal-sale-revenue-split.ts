import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph } from "./build";

const g = graph(
  [
    { id: "checkout", type: "trigger.paypal_checkout", label: "Client pays $100", at: [0, 0], config: { itemName: "Brand strategy session", amount: "100.00", currency: "USD", description: "60-minute strategy session with our creative team." } },
    { id: "once", type: "logic.once", label: "One split per capture", at: [1, 0], config: { key: "capture:{{ trigger.captureId }}" } },
    { id: "order", type: "paypal.get_order", label: "Confirm with PayPal", at: [2, 0], config: { orderId: "{{ trigger.orderId }}", requireCompleted: true } },
    {
      id: "split",
      type: "data.allocate",
      label: "70 / 20 / 10 split",
      at: [3, 0],
      config: {
        total: "{{ input.order.net }}",
        currency: "{{ input.order.currency }}",
        mode: "percent",
        recipients: [
          { label: "Creator", email: "creator@example.com", share: "70" },
          { label: "Agency partner", email: "agency@example.com", share: "20" },
          { label: "Operations reserve", email: "", share: "10" },
        ],
      },
    },
    { id: "review", type: "ai.review", label: "AI risk review", at: [0, 1], config: { maxAmount: "500.00", guidance: "Flag new or unusual recipients, splits that don't match the capture, and test data." } },
    {
      id: "approval",
      type: "logic.approval",
      label: "Owner approves payout",
      at: [1, 1],
      config: { message: "Pay out {{ input.allocation.payout }} of the {{ input.allocation.total }} {{ input.allocation.currency }} net from capture {{ trigger.captureId }}? AI risk: {{ input.review.risk }}.", timeoutHours: 24 },
    },
    { id: "payout", type: "paypal.payout", label: "PayPal payout batch", at: [2, 1], config: { subject: "Your share of a client payment", note: "Your share of order {{ trigger.orderId }}. Thank you!" } },
    { id: "status", type: "paypal.payout_status", label: "Wait for payouts to land", at: [3, 1], config: { timeoutHours: 48 } },
    { id: "slack", type: "notify.slack", label: "Tell the team", at: [4, 1], config: { message: "Revenue split for capture {{ trigger.captureId }}: payout batch {{ input.payout.batchId }} is {{ input.payoutStatus.status }} ({{ input.payoutStatus.paid }} paid, {{ input.payoutStatus.problems }} problems). Run {{ run.id }}." } },
  ],
  [["checkout", "once"], ["once", "order"], ["order", "split"], ["split", "review"], ["review", "approval"], ["approval", "payout", "approved"], ["payout", "status"], ["status", "slack"], ["status", "slack", "failed"]],
);

export const paypalSaleRevenueSplit: TemplateDefinition = {
  slug: "paypal-sale-revenue-split",
  name: "PayPal Sale → Revenue Split Payout",
  shortDescription: "When a client pays through PayPal, split the net to the cent, let AI check it, approve, and pay everyone with PayPal Payouts.",
  fullDescription:
    "A client pays your hosted PayPal checkout. Money Lego confirms the capture with PayPal, splits the net amount (after PayPal's fee) between a creator, an agency partner and an operations reserve in whole cents, runs deterministic and AI risk checks, and waits for you to approve the exact payout. On approval it sends one PayPal Payouts batch, waits until PayPal reports every item paid, and tells the team in Slack.",
  useCase:
    "Agencies, studios and creator businesses split client revenue with collaborators by a fixed rule. Today that means reading the PayPal dashboard, a spreadsheet and sending payouts by hand. This makes the rule explicit, reviewable and executed exactly once per payment.",
  howItWorks: [
    "The workflow gets its own PayPal checkout page at the price you set. When a buyer pays and the capture is COMPLETED, the run starts; the verified webhook for the same capture never starts a second one.",
    "Each capture is claimed once, so a retried event can never split the same payment twice.",
    "The order is fetched back from PayPal and must report a COMPLETED capture.",
    "The net amount is split 70 / 20 / 10 in cents; the operations reserve stays with the business and is never paid out.",
    "AI and rule checks review the split: totals reconcile, currency matches, recipients are valid, amount under your limit.",
    "You approve the exact recipients and amounts. Any change after approval makes the payout refuse to run.",
    "PayPal Payouts sends the batch with a stable batch id, so a retry can't pay twice. The run waits until PayPal reports the items paid.",
    "Slack gets the outcome, including problems like unclaimed or failed items.",
  ],
  category: "Revenue Operations",
  difficulty: "Beginner",
  estimatedSetupMinutes: { min: 5, max: 10 },
  integrations: ["paypal", "slack"],
  tags: ["paypal", "payouts", "revenue share", "checkout", "ai review"],
  thumbnailAlt: "Workflow diagram: a PayPal checkout capture is claimed once, confirmed with PayPal, split 70/20/10, reviewed by AI, approved by the owner, paid with a PayPal payout batch, followed until paid, and posted to Slack.",
  graphDefinition: g,
  exampleScenario: {
    headline: "A $100 strategy session is paid and the net is split three ways",
    narrative:
      "A sandbox buyer pays $100.00. PayPal keeps its fee and reports $96.02 net (the fee varies by account). Money Lego splits the net 70/20/10: $67.22 to the creator, $19.20 to the agency partner and $9.60 kept as reserve. You approve $86.42 in payouts; PayPal sends the batch.",
    sampleInput: { source: "checkout", orderId: "5O190127TN364715T", captureId: "3C679366HH908993F", status: "COMPLETED", currency: "USD", amount: "100.00", net: "96.02" },
    expectedStepOutputs: [
      { nodeId: "order", label: "Confirmed with PayPal", exampleOutput: { order: { status: "COMPLETED", captureStatus: "COMPLETED", net: "96.02", currency: "USD" } } },
      {
        nodeId: "split",
        label: "Split to the cent",
        exampleOutput: { allocation: { currency: "USD", total: "96.02", payoutMinor: "8642", items: [{ label: "Creator", amountMinor: "6722" }, { label: "Agency partner", amountMinor: "1920" }, { label: "Operations reserve", amountMinor: "960", keep: true }] } },
      },
      { nodeId: "review", label: "AI review", exampleOutput: { review: { risk: "low", summary: "Shares reconcile with the capture; two known recipients." } } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["2 recipients", "86.42 USD", "fingerprint"] } },
    ],
    safetyNotes: ["Example only, a dry run. Amounts are illustrative; PayPal's real fee decides the net.", "Recipient emails are example.com placeholders: use your sandbox test accounts."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "checkout", status: "would_run", note: "Starts from PayPal's capture data." },
      { nodeId: "split", status: "would_run", note: "Computes shares in whole cents." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
      { nodeId: "payout", status: "would_run", note: "Only after approval, with a stable batch id." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "price", title: "Set what the client pays", detail: "Item name, price and currency on the checkout trigger. Turn the workflow on to open its checkout page.", nodeIds: ["checkout"] },
    { id: "recipients", title: "Set who gets what", detail: "Replace the example.com emails with your PayPal sandbox recipient accounts and adjust the percentages.", nodeIds: ["split"] },
    { id: "limit", title: "Set your risk limit", detail: "Payouts above this amount are flagged as high risk for the approver.", nodeIds: ["review"] },
    { id: "slack", title: "Connect Slack", detail: "Click Add to Slack and pick the channel for results.", nodeIds: ["slack"] },
  ],
  safetyNotes: [
    "Sandbox only: no real money moves.",
    "Every payout waits for your approval of the exact recipients and amounts.",
    "Each capture is split once, even if PayPal redelivers the event.",
    "PayPal Payouts must be enabled on your PayPal app; if it isn't, the payout step says so and nothing is sent.",
  ],
};
