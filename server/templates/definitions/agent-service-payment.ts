import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const g = graph(
  [
    { id: "invoice", type: "trigger.webhook", label: "Agent invoice", at: [0, 0] },
    {
      id: "shape",
      type: "data.validate",
      label: "Check invoice shape",
      at: [1, 0],
      config: {
        rules: [
          { path: "body.invoiceId", type: "string" },
          { path: "body.agent", type: "string" },
          { path: "body.payTo", type: "array" },
        ],
      },
    },
    { id: "once", type: "logic.once", label: "Pay each invoice once", at: [2, 0], config: { key: "agent-invoice:{{ trigger.body.agent }}:{{ trigger.body.invoiceId }}" } },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Budget cap",
      at: [3, 0],
      config: { rows: "{{ trigger.body.payTo }}", tokenMint: usdcMint(), walletField: "wallet", amountField: "amount", labelField: "service", maxTotal: "50" },
    },
    ...payoutSteps([0, 1], "Agent {{ trigger.body.agent }} invoice {{ trigger.body.invoiceId }}: pay {{ input.amount }} {{ input.symbol }} to {{ input.destinations.length }} service wallet(s)."),
    { id: "result", type: "mh.result", label: "Payment summary", at: [5, 1] },
    { id: "telegram", type: "notify.telegram", label: "Tell the operator", at: [6, 1], config: { message: "Agent invoice {{ trigger.body.invoiceId }} is {{ input.state }}: {{ input.amount }}. Receipt: {{ input.receiptUrl }}" } },
  ],
  [["invoice", "shape"], ["shape", "once"], ["once", "allocate"], ...payoutEdges("allocate"), ["wait", "result"], ["wait", "result", "failed"], ["result", "telegram"]],
);

export const agentServicePayment: TemplateDefinition = {
  slug: "agent-service-payment",
  name: "AI Agent Service Payments",
  shortDescription: "Let an AI agent request payment for services it bought, inside a hard budget, with your approval and signature on every invoice.",
  fullDescription:
    "Your agent buys research, compute or API calls from other agents and posts a signed invoice to this workflow. Money Lego checks the invoice shape, refuses repeats, enforces a per-invoice budget cap and prepares one MultiHopper transfer to the service wallets. You approve and sign; the agent never holds a key and can never pay itself more than the cap.",
  useCase:
    "Agent treasuries and agent-to-agent marketplaces need programmable spending without handing an LLM a private key. The agent can ask; only the owner's approval and wallet can pay, and the budget rule is enforced in code, not in a prompt.",
  howItWorks: [
    "The agent signs the raw invoice body with your webhook secret. Unsigned or altered requests are refused.",
    "The invoice must have invoiceId, agent and a payTo list of { wallet, amount, service }.",
    "Each agent and invoice pair is claimed once, so a replayed invoice can't pay twice.",
    "The payout must total 50 USDC or less (your cap) and go to 1 to 20 valid wallets. Anything else stops the run with the reason.",
    "MultiHopper quotes it, you approve and sign in your wallet.",
    "You get a Telegram message with the outcome and receipt.",
  ],
  category: "AI Agents",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 10, max: 15 },
  integrations: ["multihopper", "telegram"],
  tags: ["ai-agents", "agent-commerce", "budget", "treasury", "usdc"],
  thumbnailAlt: "Workflow diagram: an AI agent posts a signed invoice, the shape is validated, repeats are refused, a budget cap is enforced, then MultiHopper quote, operator review, wallet authorization and a Telegram receipt.",
  graphDefinition: g,
  exampleScenario: {
    headline: "A research agent bills 12 USDC for two data purchases",
    narrative:
      "Your research agent bought a dataset and a summarisation call from two other agents and posts invoice INV-DEMO-7 for 8 and 4 USDC. It passes the 50 USDC cap, is quoted, and waits for your review. All values are illustrative and the wallets are placeholders.",
    sampleInput: { body: { invoiceId: "INV-DEMO-7", agent: "research-bot", payTo: [{ wallet: "{{configure_wallet}}", amount: "8", service: "dataset" }, { wallet: "{{configure_wallet}}", amount: "4", service: "summary" }] } },
    expectedStepOutputs: [
      { nodeId: "once", label: "Invoice claimed", exampleOutput: { onceKey: "agent-invoice:research-bot:INV-DEMO-7" } },
      { nodeId: "allocate", label: "Within budget", exampleOutput: { amount: "12", symbol: "USDC", destinations: 2 } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["agent", "invoice", "12 USDC", "fee"] } },
    ],
    safetyNotes: ["Example only, a dry run. No funds move.", "The agent can only request. Approval and your wallet signature pay."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "invoice", status: "would_stop", note: "Waits until you create a signing secret and share it with your agent." },
      { nodeId: "allocate", status: "would_run", note: "12 USDC is under the 50 USDC cap." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "secret", title: "Create the signing secret", detail: "Create a webhook secret and give it to your agent. It signs each invoice body with HMAC-SHA256.", nodeIds: ["invoice"] },
    { id: "cap", title: "Set the budget cap", detail: "50 USDC per invoice is the default. Lower it for new agents.", nodeIds: ["allocate"] },
    { id: "telegram", title: "Connect Telegram", detail: "Open our bot in the chat that should hear about agent spending.", nodeIds: ["telegram"] },
  ],
  safetyNotes: [
    "Imported disabled. Nothing runs until you finish setup and turn it on.",
    "The agent never holds a key. Every invoice waits for your approval and wallet signature.",
    "Invoices over the cap stop. They are never split to fit.",
  ],
};
