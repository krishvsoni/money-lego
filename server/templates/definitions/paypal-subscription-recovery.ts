import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph } from "./build";

const g = graph(
  [
    { id: "failed", type: "trigger.paypal_event", label: "Subscription payment failed", at: [0, 0], config: { eventType: "BILLING.SUBSCRIPTION.PAYMENT.FAILED", samplePayload: '{ "source": "test", "eventType": "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "resourceId": "I-BW452GLLEP1G" }' } },
    { id: "once", type: "logic.once", label: "Once per event", at: [1, 0], config: { key: "sub-failed:{{ trigger.eventId }}{{ trigger.resourceId }}" } },
    { id: "sub", type: "paypal.get_subscription", label: "Load subscription", at: [2, 0], config: { subscriptionId: "{{ trigger.resourceId }}" } },
    {
      id: "summary",
      type: "ai.write",
      label: "AI explains the failure",
      at: [3, 0],
      config: {
        instructions: "Explain to the business owner in 2-3 sentences why this subscription payment likely failed (use the reason code if present), how many payments failed, what is outstanding, and the next retry time. Then suggest one next step.",
        data: "{{ input.subscription }}",
        tone: "neutral",
      },
    },
    { id: "owed", type: "logic.condition", label: "Balance outstanding?", at: [4, 0], config: { left: "{{ nodes.sub.subscription.outstanding }}", operator: "gt", right: "0" } },
    {
      id: "invoice",
      type: "paypal.create_invoice",
      label: "Draft catch-up invoice",
      at: [1, 1],
      config: {
        recipientEmail: "{{ nodes.sub.subscription.subscriberEmail }}",
        recipientName: "{{ nodes.sub.subscription.subscriberName }}",
        itemName: "Outstanding subscription balance ({{ nodes.sub.subscription.id }})",
        amount: "{{ nodes.sub.subscription.outstanding }}",
        currency: "USD",
        dueInDays: 7,
        note: "Your last subscription payment didn't go through. You can settle the balance here.",
      },
    },
    { id: "approval", type: "logic.approval", label: "Approve sending it", at: [2, 1], config: { message: "Send a catch-up invoice for {{ nodes.sub.subscription.outstanding }} to the subscriber? AI summary: {{ nodes.summary.draft.message }}", timeoutHours: 72 } },
    { id: "send", type: "paypal.send_invoice", label: "Send through PayPal", at: [3, 1], config: { mode: "send", subject: "Your subscription balance", note: "Thanks for being a customer. Your last payment didn't go through; you can settle the balance with this invoice." } },
    { id: "slack", type: "notify.slack", label: "Alert the team", at: [4, 1], config: { message: "Subscription {{ nodes.sub.subscription.id }} payment failed ({{ nodes.sub.subscription.failedPayments }} failures). {{ nodes.summary.draft.message }}" } },
  ],
  [["failed", "once"], ["once", "sub"], ["sub", "summary"], ["summary", "owed"], ["owed", "invoice", "true"], ["owed", "slack", "false"], ["invoice", "approval"], ["approval", "send", "approved"], ["send", "slack"]],
);

export const paypalSubscriptionRecovery: TemplateDefinition = {
  slug: "paypal-subscription-recovery",
  name: "Failed Subscription Payment Recovery",
  shortDescription: "When a PayPal subscription payment fails, load the subscription, let AI explain why, and, with your approval, send a catch-up invoice.",
  fullDescription:
    "A verified BILLING.SUBSCRIPTION.PAYMENT.FAILED webhook starts the run. Money Lego loads the subscription from PayPal, AI explains the likely cause from the failure reason, failed-payment count and outstanding balance, and the team is alerted. If a balance is outstanding, a draft catch-up invoice is prepared and sent through PayPal only after you approve.",
  useCase: "Subscription businesses lose revenue to failed payments that nobody follows up on. This turns each failure into a clear explanation and a reviewed recovery action.",
  howItWorks: [
    "PayPal's webhook is verified with PayPal's signature API and stored once by event id.",
    "Each event is handled once.",
    "The subscription's billing state comes straight from PayPal.",
    "AI summarises the failure for the owner using only PayPal's data.",
    "With a balance outstanding, a draft invoice is created (nothing is sent yet).",
    "You approve; PayPal sends the invoice to the subscriber.",
    "Slack gets the explanation either way.",
  ],
  category: "Subscriptions",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 8, max: 15 },
  integrations: ["paypal", "slack"],
  tags: ["paypal", "subscriptions", "dunning", "ai summary", "invoicing"],
  thumbnailAlt: "Workflow diagram: a PayPal subscription payment failed event loads the subscription, AI explains the failure, an outstanding balance leads to a draft invoice, owner approval and PayPal sending it, and Slack is alerted.",
  graphDefinition: g,
  exampleScenario: {
    headline: "A monthly plan's payment fails for insufficient funds",
    narrative: "PayPal reports payment failure for subscription I-BW452GLLEP1G: second failure, 29.00 USD outstanding, reason PAYMENT_DENIED. AI summarises it; a 29.00 USD catch-up invoice is drafted and waits for your approval.",
    sampleInput: { eventType: "BILLING.SUBSCRIPTION.PAYMENT.FAILED", resourceId: "I-BW452GLLEP1G" },
    expectedStepOutputs: [
      { nodeId: "sub", label: "From PayPal", exampleOutput: { subscription: { status: "ACTIVE", failedPayments: 2, outstanding: "29.00", lastFailedReason: "PAYMENT_DENIED" } } },
      { nodeId: "summary", label: "AI summary", exampleOutput: { draft: { message: "The card behind this subscription was declined twice…" } } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["invoice INV2-…", "29.00 USD"] } },
    ],
    safetyNotes: ["Example only, a dry run.", "Money Lego never retries a payment or changes a subscription."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "sub", status: "would_run", note: "Reads the subscription." },
      { nodeId: "invoice", status: "would_run", note: "Draft only; not sent." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "webhook", title: "Register the PayPal webhook", detail: "Run npm run paypal:webhook once for the server (it subscribes BILLING.SUBSCRIPTION.PAYMENT.FAILED) and set PAYPAL_WEBHOOK_ID.", nodeIds: ["failed"] },
    { id: "currency", title: "Check the invoice currency", detail: "Match your plan's currency.", nodeIds: ["invoice"] },
    { id: "slack", title: "Connect Slack", detail: "Click Add to Slack and pick a channel.", nodeIds: ["slack"] },
  ],
  safetyNotes: ["Nothing reaches the customer without your approval.", "No automatic payment retries or subscription changes.", "Subscription events route only to the workspace whose subscription it is."],
};
