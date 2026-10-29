import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const g = graph(
  [
    { id: "deal", type: "trigger.webhook", label: "Deal booked", at: [0, 0] },
    {
      id: "shape",
      type: "data.validate",
      label: "Check deal ticket",
      at: [1, 0],
      config: {
        rules: [
          { path: "body.dealId", type: "string" },
          { path: "body.totalUsdc", type: "string" },
          { path: "body.legs", type: "array" },
        ],
      },
    },
    { id: "once", type: "logic.once", label: "Settle each deal once", at: [2, 0], config: { key: "otc:{{ trigger.body.dealId }}" } },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Match the ticket",
      at: [3, 0],
      config: { rows: "{{ trigger.body.legs }}", tokenMint: usdcMint(), walletField: "wallet", amountField: "amount", labelField: "counterparty", expectedTotal: "{{ trigger.body.totalUsdc }}", maxTotal: "" },
    },
    ...payoutSteps([0, 1], "OTC deal {{ trigger.body.dealId }}: settle {{ input.amount }} {{ input.symbol }} to {{ input.destinations.length }} counterparty wallet(s). Check it matches the signed ticket."),
    { id: "result", type: "mh.result", label: "Settlement receipt", at: [5, 1] },
    { id: "telegram", type: "notify.telegram", label: "Desk receipt", at: [6, 1], config: { message: "Deal {{ trigger.body.dealId }} settlement is {{ input.state }}: {{ input.amount }}. Receipt: {{ input.receiptUrl }}" } },
  ],
  [["deal", "shape"], ["shape", "once"], ["once", "allocate"], ...payoutEdges("allocate"), ["wait", "result"], ["wait", "result", "failed"], ["result", "telegram"]],
);

export const otcSettlement: TemplateDefinition = {
  slug: "otc-settlement",
  name: "OTC Deal Settlement",
  shortDescription: "Turn a booked OTC deal ticket into one reviewed, routed settlement with a shareable receipt.",
  fullDescription:
    "Your desk or deal tool posts a signed ticket when a trade is booked. Money Lego checks the ticket, refuses a second settlement of the same deal, requires the legs to add up exactly to the agreed total and prepares one MultiHopper transfer. You review and sign; the desk gets the receipt link with every signature once it lands.",
  useCase:
    "OTC desks settle by copy-pasting wallets and amounts from chat into a wallet, which is where fat-finger and double-settlement mistakes happen. This makes quote-to-delivery one checked, signed step with a receipt both sides can verify.",
  howItWorks: [
    "The deal tool signs the ticket body with your webhook secret. Unsigned requests are refused.",
    "The ticket needs dealId, totalUsdc and legs of { wallet, amount, counterparty }.",
    "Each deal ID settles once, even if the ticket is sent again.",
    "The legs must add up exactly to totalUsdc. A mismatch stops the run before anything is quoted.",
    "MultiHopper quotes it, you approve and sign in your wallet.",
    "The desk's Telegram gets the outcome and the receipt link.",
  ],
  category: "Settlement",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 10, max: 15 },
  integrations: ["multihopper", "telegram"],
  tags: ["otc", "settlement", "receipts", "usdc"],
  thumbnailAlt: "Workflow diagram: a signed OTC deal ticket is validated, claimed once, matched against the agreed total, then MultiHopper quote, operator review, wallet authorization and a Telegram receipt.",
  graphDefinition: g,
  exampleScenario: {
    headline: "Deal OTC-DEMO-31 settles 25,000 USDC in one leg",
    narrative:
      "The desk books OTC-DEMO-31 for 25,000 USDC to one counterparty. The ticket matches its total, is quoted, and waits for review. All values are illustrative and the wallet is a placeholder.",
    sampleInput: { body: { dealId: "OTC-DEMO-31", totalUsdc: "25000", legs: [{ wallet: "{{configure_wallet}}", amount: "25000", counterparty: "Counterparty A" }] } },
    expectedStepOutputs: [
      { nodeId: "allocate", label: "Ticket matches", exampleOutput: { amount: "25000", symbol: "USDC", destinations: 1 } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["deal", "25,000 USDC", "fee"] } },
    ],
    safetyNotes: ["Example only, a dry run. No funds move.", "A ticket's total is a check, not proof that funds were received."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "deal", status: "would_stop", note: "Waits until you create a signing secret for your deal tool." },
      { nodeId: "allocate", status: "would_run", note: "Legs add up to the agreed total." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "secret", title: "Create the signing secret", detail: "Create a webhook secret and configure your deal tool to sign each ticket with it.", nodeIds: ["deal"] },
    { id: "cap", title: "Set a spending cap", detail: "Optional. Stop any single settlement above this many USDC.", nodeIds: ["allocate"] },
    { id: "telegram", title: "Connect Telegram", detail: "Open our bot in the desk chat that should receive receipts.", nodeIds: ["telegram"] },
  ],
  safetyNotes: [
    "Imported disabled. Nothing runs until you finish setup and turn it on.",
    "Every settlement waits for your approval and wallet signature.",
    "A deal ID can only settle once.",
  ],
};
