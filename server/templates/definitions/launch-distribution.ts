import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const g = graph(
  [
    { id: "start", type: "trigger.manual", label: "Release a tranche", at: [0, 0], config: { samplePayload: JSON.stringify({ tranche: "LAUNCH-DEMO-T1" }) } },
    {
      id: "sheet",
      type: "sheets.lookup_rows",
      label: "Allocations in tranche",
      at: [1, 0],
      config: { spreadsheetId: "", sheet: "Allocations", approvedColumn: "approved", paidColumn: "paid", matchColumn: "tranche", matchValue: "{{ trigger.tranche }}" },
    },
    { id: "once", type: "logic.once", label: "Release each tranche once", at: [2, 0], config: { key: "tranche:{{ trigger.tranche }}" } },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Validate allocations",
      at: [3, 0],
      config: { rows: "{{ input.rows }}", tokenMint: usdcMint(), walletField: "wallet", amountField: "amount", labelField: "holder", maxTotal: "" },
    },
    ...payoutSteps([0, 1], "Launch tranche {{ trigger.tranche }}: distribute {{ input.amount }} {{ input.symbol }} to {{ input.destinations.length }} allocation holders in one routed Multi-Send."),
    { id: "result", type: "mh.result", label: "Tranche summary", at: [5, 1] },
    { id: "discord", type: "notify.discord", label: "Announce", at: [6, 1], config: { message: "Tranche {{ trigger.tranche }} is {{ input.state }}: {{ input.amount }} to {{ input.recipients }} holders. Receipt: {{ input.receiptUrl }}" } },
  ],
  [["start", "sheet"], ["sheet", "once"], ["once", "allocate"], ...payoutEdges("allocate"), ["wait", "result"], ["wait", "result", "failed"], ["result", "discord"]],
);

export const launchDistribution: TemplateDefinition = {
  slug: "launch-distribution",
  name: "Launch Tranche Distribution",
  shortDescription: "Send one tranche of launch allocations from a sheet as a single routed Multi-Send, reviewed and signed once.",
  fullDescription:
    "Allocations for team, advisors, KOLs or early supporters live in a sheet with a tranche column. Press run with the tranche name: Money Lego loads the approved, unpaid rows, refuses to release the same tranche twice, validates every wallet and amount and prepares one MultiHopper Multi-Send. You review and sign once; the community channel gets the receipt.",
  useCase:
    "Launches pay dozens of allocations in waves and the wallet-by-wallet process is slow and error-prone. Each tranche becomes one checked, routed distribution with a public receipt.",
  howItWorks: [
    "Run it from the editor with the tranche name in the payload.",
    "Google Sheets returns rows in that tranche where approved is TRUE and paid isn't.",
    "The tranche is claimed, so it can't be released twice.",
    "Recipients are validated: 1 to 20 distinct wallets, exact amounts. Larger tranches stop; split them into smaller tranches yourself.",
    "MultiHopper quotes one Multi-Send, you approve and sign once.",
    "Your Discord channel gets the outcome and the receipt.",
  ],
  category: "Launches",
  difficulty: "Beginner",
  estimatedSetupMinutes: { min: 10, max: 15 },
  integrations: ["google-sheets", "multihopper", "discord"],
  tags: ["launch", "distribution", "multi-send", "allocations", "usdc"],
  thumbnailAlt: "Workflow diagram: a manual run loads one tranche of approved allocations from Google Sheets, claims it once, validates it, then MultiHopper quote, operator review, wallet authorization and a Discord announcement.",
  graphDefinition: g,
  exampleScenario: {
    headline: "Tranche LAUNCH-DEMO-T1 pays four holders in one signature",
    narrative:
      "You run tranche LAUNCH-DEMO-T1. Four approved allocations (2,000, 1,500, 1,000 and 500 USDC) are validated and quoted as one Multi-Send waiting for review. All values are illustrative and the wallets are placeholders.",
    sampleInput: { tranche: "LAUNCH-DEMO-T1" },
    expectedStepOutputs: [
      { nodeId: "sheet", label: "Approved allocations", exampleOutput: { rowCount: 4 } },
      { nodeId: "allocate", label: "One Multi-Send", exampleOutput: { amount: "5000", symbol: "USDC", destinations: 4 } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["tranche", "4 recipients", "5,000 USDC", "fee"] } },
    ],
    safetyNotes: ["Example only, a dry run. No funds move.", "Mark rows paid in the sheet after the receipt arrives."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "sheet", status: "would_run", note: "Reads 4 approved allocations." },
      { nodeId: "allocate", status: "would_stop", note: "Stops until real wallets replace the placeholders." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "sheet", title: "Sign in with Google", detail: "Allow read-only Sheets access and set the spreadsheet ID. Columns: holder, wallet, amount, tranche, approved, paid.", nodeIds: ["sheet"] },
    { id: "cap", title: "Set a tranche cap", detail: "Optional. Stop any tranche larger than this many USDC.", nodeIds: ["allocate"] },
    { id: "discord", title: "Connect Discord", detail: "Pick the announcement channel on Discord's screen.", nodeIds: ["discord"] },
  ],
  safetyNotes: [
    "Imported disabled. Nothing runs until you finish setup.",
    "Every tranche waits for your approval and wallet signature.",
    "More than 20 holders stops the run. Split the tranche yourself.",
  ],
};
