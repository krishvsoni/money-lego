import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph } from "./build";

const sample = JSON.stringify({ captureId: "3C679366HH908993F", amount: "25.00", currency: "USD", reason: "Customer was double-booked and asked for a partial refund." }, null, 2);

const g = graph(
  [
    { id: "request", type: "trigger.manual", label: "Refund request", at: [0, 0], config: { samplePayload: sample } },
    { id: "check", type: "data.validate", label: "Request is complete", at: [1, 0], config: { rules: [{ path: "captureId", type: "string" }, { path: "amount", type: "string" }, { path: "reason", type: "string" }] } },
    { id: "once", type: "logic.once", label: "One refund per capture", at: [2, 0], config: { key: "refund:{{ trigger.captureId }}" } },
    { id: "review", type: "ai.review", label: "AI checks the request", at: [3, 0], config: { maxAmount: "100.00", guidance: "Is the reason consistent with a refund? Is the amount unusually large?" } },
    { id: "approval", type: "logic.approval", label: "Approve refund", at: [1, 1], config: { message: "Refund {{ trigger.amount }} {{ trigger.currency }} on capture {{ trigger.captureId }}? Reason: {{ trigger.reason }}. AI: {{ input.review.summary }}", timeoutHours: 24 } },
    { id: "refund", type: "paypal.refund", label: "Refund via PayPal", at: [2, 1], config: { captureId: "{{ trigger.captureId }}", amount: "{{ trigger.amount }}", currency: "USD", note: "Refund for your booking. Sorry for the trouble." } },
    { id: "log", type: "util.log", label: "Record outcome", at: [3, 1], config: { message: "Refund {{ input.refund.id }} is {{ input.refund.status }} for capture {{ input.refund.captureId }}." } },
  ],
  [["request", "check"], ["check", "once"], ["once", "review"], ["review", "approval"], ["approval", "refund", "approved"], ["refund", "log"]],
);

export const paypalRefundDesk: TemplateDefinition = {
  slug: "paypal-refund-desk",
  name: "Approved Refund Desk",
  shortDescription: "Turn a refund request into an AI-checked, owner-approved PayPal refund that can only happen once per payment.",
  fullDescription:
    "A refund request (capture id, amount, reason) is validated, claimed once per capture, reviewed by AI and rule checks, and shown to you with the exact capture and amount. On approval PayPal refunds it with an idempotency key, and the outcome is recorded.",
  useCase: "Support teams issue refunds from the PayPal dashboard with no record of who approved what or why. This puts every refund behind a reason, a check and an approval.",
  howItWorks: [
    "Start it from the editor (or swap in a webhook trigger from your helpdesk).",
    "The request must name a capture, an amount and a reason.",
    "A capture can only be refunded once through this workflow.",
    "AI and rule checks flag large or odd requests.",
    "You approve the exact capture and amount.",
    "PayPal refunds it; a retry returns the same refund instead of a second one.",
  ],
  category: "Customer Support",
  difficulty: "Beginner",
  estimatedSetupMinutes: { min: 2, max: 5 },
  integrations: ["paypal"],
  tags: ["paypal", "refunds", "approvals", "ai review"],
  thumbnailAlt: "Workflow diagram: a refund request is validated, claimed once per capture, reviewed by AI, approved by the owner, refunded through PayPal and logged.",
  graphDefinition: g,
  exampleScenario: {
    headline: "A partial $25 refund for a double booking",
    narrative: "Support asks to refund 25.00 USD of a 100.00 USD capture. AI sees nothing unusual; you approve; PayPal refunds it.",
    sampleInput: { captureId: "3C679366HH908993F", amount: "25.00", currency: "USD", reason: "Double-booked" },
    expectedStepOutputs: [
      { nodeId: "review", label: "AI check", exampleOutput: { review: { risk: "low" } } },
      { nodeId: "refund", label: "PayPal refund", exampleOutput: { refund: { status: "COMPLETED", amount: "25.00" } } },
    ],
    safetyNotes: ["Example only, a dry run.", "Use a capture id from your own sandbox checkout."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
      { nodeId: "refund", status: "would_run", note: "Only after approval." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [{ id: "capture", title: "Use a real sandbox capture", detail: "Pay a checkout link once, then paste its capture id into the test payload.", nodeIds: ["request"] }],
  safetyNotes: ["Every refund waits for your approval.", "One refund per capture through this workflow."],
};
