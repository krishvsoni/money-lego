import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const budgetBody = JSON.stringify({ batch: "{{ trigger.payload.batch }}", amount: "{{ input.amount }}", token: "{{ input.symbol }}", recipients: "{{ input.destinations.length }}", policyVersion: "{{ input.policy.version }}" }, null, 2);

const g = graph(
  [
    {
      id: "schedule",
      type: "trigger.schedule",
      label: "Every Friday",
      at: [0, 0],
      config: { mode: "weekly", weekday: "5", time: "15:00", timezone: "", payload: JSON.stringify({ batch: "GRANTS-DEMO-W42" }) },
    },
    {
      id: "sheet",
      type: "sheets.lookup_rows",
      label: "Approved grants in batch",
      at: [1, 0],
      config: { spreadsheetId: "", sheet: "Grants", approvedColumn: "approved", paidColumn: "paid", matchColumn: "batch", matchValue: "{{ trigger.payload.batch }}" },
    },
    { id: "once", type: "logic.once", label: "Run each batch once", at: [2, 0], config: { key: "grant-batch:{{ trigger.payload.batch }}" } },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Validate batch",
      at: [3, 0],
      config: { rows: "{{ input.rows }}", tokenMint: usdcMint(), walletField: "wallet", amountField: "grant_usdc", labelField: "grantee", maxTotal: "" },
    },
    { id: "policy", type: "notion.get_page", label: "Grant policy", at: [0, 1], config: { pageId: "" } },
    {
      id: "budget",
      type: "http.request",
      label: "Treasury budget check",
      at: [1, 1],
      config: { method: "POST", url: "", allowedHost: "", keepInput: true, body: budgetBody, timeoutSeconds: 10, responseRules: [{ path: "body.approved", type: "boolean" }] },
    },
    { id: "within", type: "logic.condition", label: "Budget approved", at: [2, 1], config: { left: "{{ input.response.body.approved }}", operator: "equals", right: "true" } },
    { id: "over", type: "util.log", label: "Log refusal", at: [3, 2], config: { message: "Treasury check refused batch {{ trigger.payload.batch }}. Nothing was quoted or sent." } },
    ...payoutSteps([3, 1], "Grant batch {{ trigger.payload.batch }} under {{ nodes.policy.policy.title }} ({{ nodes.policy.policy.version }}): pay {{ input.amount }} {{ input.symbol }} to {{ input.destinations.length }} grantees from your wallet."),
    { id: "result", type: "mh.result", label: "Transfer summary", at: [7, 2] },
    { id: "slack", type: "notify.slack", label: "Notify Slack", at: [8, 2], config: { message: "Grant batch {{ trigger.payload.batch }} is {{ input.state }}: {{ input.amount }} to {{ input.recipients }} grantees. Run {{ run.id }}." } },
    {
      id: "record",
      type: "notion.create_page",
      label: "Record the run",
      at: [9, 2],
      config: { databaseId: "", titleProperty: "Name", title: "Grant batch {{ trigger.payload.batch }}: {{ input.state }}", summary: "Run {{ run.id }}. {{ input.amount }} to {{ input.recipients }} grantees. Receipt: {{ input.receiptUrl }}" },
    },
  ],
  [
    ["schedule", "sheet"],
    ["sheet", "once"],
    ["once", "allocate"],
    ["allocate", "policy"],
    ["policy", "budget"],
    ["budget", "within"],
    ["within", "over", "false"],
    ...payoutEdges("within").map(([a, b, p]): [string, string, string?] => (a === "within" ? [a, b, "true"] : [a, b, p])),
    ["wait", "result"],
    ["wait", "result", "failed"],
    ["result", "slack"],
    ["slack", "record"],
  ],
);

export const weeklyGrantDistribution: TemplateDefinition = {
  slug: "weekly-grant-distribution",
  name: "Weekly Grant Distribution",
  shortDescription: "Prepare a recurring batch of approved grants from a sheet, check the documented policy and request a single reviewed payout run.",
  fullDescription:
    "Every Friday at the time and timezone you choose, Money Lego loads the grants marked approved for the batch, validates the recipients, reads your grant policy page, asks your treasury service whether the batch fits the budget, and prepares one MultiHopper transfer. You review and sign it. The schedule starts runs; it never skips approval or your wallet signature.",
  useCase:
    "Grant programs and DAOs pay a weekly batch of approved grantees. The list lives in a sheet, the rules in a doc and the budget in a treasury tool. This turns the weekly ritual into one prepared, reviewed and signed payout with a record of each run.",
  howItWorks: [
    "The schedule fires weekly at your chosen day, time and timezone. It stays off until you set them and turn the workflow on.",
    "Google Sheets returns rows in the batch where approved is TRUE and paid isn't.",
    "The batch is claimed, so it can't run twice.",
    "Recipients are validated: 1 to 20 distinct wallets, exact amounts. A bigger batch stops with an explanation and is never split silently.",
    "Notion returns the grant policy page and its version.",
    "Your treasury service answers whether the batch fits the budget. That answer is not treated as proof of an on-chain balance.",
    "If approved, MultiHopper quotes the batch and you review, approve and sign. If refused, the run logs why and stops.",
    "The outcome goes to Slack and a Notion record.",
  ],
  category: "Treasury Operations",
  difficulty: "Advanced",
  estimatedSetupMinutes: { min: 20, max: 30 },
  integrations: ["schedule", "google-sheets", "notion", "http", "multihopper", "slack"],
  tags: ["grants", "treasury", "dao", "recurring", "usdc"],
  thumbnailAlt: "Workflow diagram: a weekly schedule loads approved grant rows from Google Sheets, validates the batch, reads a Notion policy, runs a treasury budget check over HTTP and branches, then MultiHopper quote, operator review, wallet authorization, Slack and a Notion record.",
  graphDefinition: g,
  exampleScenario: {
    headline: "Batch GRANTS-DEMO-W42 is prepared on Friday at 15:00",
    narrative:
      "On Friday at 15:00 in the operator's timezone, the run loads three approved grants in batch GRANTS-DEMO-W42 (500, 300 and 200 USDC), reads Grant Distribution Policy — Demo, and the treasury check approves 1000 USDC. One transfer is quoted and waits for review. All values are illustrative and the wallets are placeholders.",
    sampleInput: { payload: { batch: "GRANTS-DEMO-W42" }, scheduledFor: "Friday 15:00, your timezone" },
    expectedStepOutputs: [
      {
        nodeId: "sheet",
        label: "Approved grants in the batch",
        exampleOutput: {
          rowCount: 3,
          rows: [
            { grantee: "Grantee A", wallet: "{{configure_wallet}}", grant_usdc: "500", batch: "GRANTS-DEMO-W42", approved: "TRUE" },
            { grantee: "Grantee B", wallet: "{{configure_wallet}}", grant_usdc: "300", batch: "GRANTS-DEMO-W42", approved: "TRUE" },
            { grantee: "Grantee C", wallet: "{{configure_wallet}}", grant_usdc: "200", batch: "GRANTS-DEMO-W42", approved: "TRUE" },
          ],
        },
      },
      { nodeId: "policy", label: "Policy reference", exampleOutput: { policy: { title: "Grant Distribution Policy — Demo", version: "2026-10-01T00:00:00.000Z" } } },
      { nodeId: "budget", label: "Treasury answer", exampleOutput: { response: { status: 200, body: { approved: true, remaining: "4000" } } } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["batch", "3 recipients", "1000 USDC", "fee", "policy version"] } },
    ],
    safetyNotes: [
      "Example only, a dry run. No funds move.",
      "The schedule only starts a run. Approval and your wallet signature are required every week.",
      "A treasury service's answer is not proof of an on-chain balance unless it checks your wallet on the right network.",
    ],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "schedule", status: "would_stop", note: "Stays off until you set the timezone and turn the workflow on." },
      { nodeId: "sheet", status: "would_run", note: "Reads 3 approved grants." },
      { nodeId: "allocate", status: "would_stop", note: "Stops until real wallets replace the placeholders." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "schedule", title: "Pick the timezone", detail: "Friday 15:00 is the default. Choose your IANA timezone and the batch label in the payload.", nodeIds: ["schedule"] },
    { id: "sheet", title: "Sign in with Google", detail: "Allow read-only Sheets access and set the spreadsheet ID. Columns: grantee, wallet, grant_usdc, batch, approved, paid.", nodeIds: ["sheet"] },
    { id: "rules", title: "Check the batch rules", detail: "Confirm column names and set a weekly cap.", nodeIds: ["allocate"] },
    { id: "policy", title: "Pick the policy page", detail: "Connect Notion, share the policy page with Money Lego on Notion's screen and set its ID.", nodeIds: ["policy"] },
    { id: "budget", title: "Point at your treasury service", detail: "Set the URL, allowed host and auth header. It must return { approved: true | false }.", nodeIds: ["budget"] },
    { id: "notify", title: "Connect Slack and Notion", detail: "Add to Slack for the results channel; connect Notion and pick the runs database.", nodeIds: ["slack", "record"] },
  ],
  safetyNotes: [
    "Imported disabled. No schedule runs until you complete setup and turn it on.",
    "Every batch waits for your approval and wallet signature.",
    "More than 20 recipients stops the run. Split the batch yourself and review each part.",
  ],
};
