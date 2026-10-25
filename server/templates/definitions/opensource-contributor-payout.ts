import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const g = graph(
  [
    { id: "github", type: "trigger.github", label: "GitHub release", at: [0, 0], config: { event: "release.published", repository: "" } },
    { id: "filter", type: "logic.filter", label: "Skip draft releases", at: [1, 0], config: { left: "{{ input.release.draft }}", operator: "equals", right: "false" } },
    {
      id: "sheet",
      type: "sheets.lookup_rows",
      label: "Approved payout rows",
      at: [2, 0],
      config: { spreadsheetId: "", sheet: "Payouts", approvedColumn: "approved", paidColumn: "paid", matchColumn: "release", matchValue: "{{ trigger.release.tag }}" },
    },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Validate & allocate",
      at: [3, 0],
      config: { rows: "{{ input.rows }}", tokenMint: usdcMint(), walletField: "wallet", amountField: "amount_usdc", labelField: "contributor", maxTotal: "" },
    },
    ...payoutSteps([0, 1], "Release {{ trigger.release.tag }} of {{ trigger.repository }}: pay {{ input.amount }} {{ input.symbol }} to {{ input.destinations.length }} contributors from your wallet. Check every wallet and amount below."),
    { id: "result", type: "mh.result", label: "Transfer summary", at: [5, 1] },
    {
      id: "discord",
      type: "notify.discord",
      label: "Post to Discord",
      at: [5, 2],
      config: { message: "Contributor payout for {{ trigger.repository }} {{ trigger.release.tag }} is {{ input.state }}: {{ input.amount }} to {{ input.recipients }} contributors. Run {{ run.id }}. Receipt: {{ input.receiptUrl }}" },
    },
  ],
  [["github", "filter"], ["filter", "sheet"], ["sheet", "allocate"], ...payoutEdges("allocate"), ["wait", "result"], ["wait", "result", "failed"], ["result", "discord"]],
);

export const opensourceContributorPayout: TemplateDefinition = {
  slug: "opensource-contributor-payout",
  name: "Open Source Contributor Payout",
  shortDescription: "Turn an approved GitHub release or merged contribution into a reviewed contributor payout workflow.",
  fullDescription:
    "A signed GitHub release starts the run. Money Lego reads only the rows your maintainers marked approved for that release in a Google Sheet, checks every wallet and amount, prices the payout with MultiHopper and stops for your review. Nothing moves until you approve and sign in your own wallet. When the transfer finishes or fails, Discord gets a summary with the receipt link.",
  useCase:
    "Maintainers already track who contributed to a release and what they're owed in a spreadsheet, then pay by hand from a wallet, one transfer at a time. This keeps the spreadsheet as the record of approval and removes the copy-paste, while a person still reviews and signs every payout.",
  howItWorks: [
    "GitHub sends release.published to a webhook Money Lego added to your repository with your sign-in, signed with a secret only this workflow holds. Other repositories and events are ignored.",
    "Draft releases stop here.",
    "Google Sheets returns rows for this tag where approved is TRUE and paid isn't.",
    "Every row is checked: 1 to 20 distinct valid wallets, positive USDC amounts, nothing rounded.",
    "MultiHopper quotes fees and net delivery. Nothing moves yet.",
    "You review the recipients, amounts, fee and payload fingerprint, then approve or reject.",
    "On approval, the transfer is created and you sign in your wallet: keeper funding first, then the route transactions in order.",
    "Money Lego follows the transfer to completion and posts the outcome to Discord.",
  ],
  category: "Developer Tools",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 10, max: 15 },
  integrations: ["github", "google-sheets", "multihopper", "discord"],
  tags: ["open source", "contributors", "release", "usdc", "multi-send"],
  thumbnailAlt: "Workflow diagram: a GitHub release flows through a draft filter and Google Sheets approved rows into payout validation, a MultiHopper quote, operator review, wallet authorization and a Discord summary.",
  graphDefinition: g,
  exampleScenario: {
    headline: "octo-demo/community-tools ships v1.4.0 and three contributors get paid",
    narrative:
      "The maintainers publish release v1.4.0. Their sheet has three rows tagged v1.4.0 and marked approved: Contributor A 60 USDC, Contributor B 25 USDC, Contributor C 15 USDC. The run validates the rows, quotes 100 USDC across three recipients and waits for the maintainer to review and sign. These numbers are illustrative; the wallets are placeholders and can't be paid.",
    sampleInput: {
      event: "release.published",
      deliveryId: "example-delivery-id",
      repository: "octo-demo/community-tools",
      release: { tag: "v1.4.0", name: "v1.4.0", draft: false, prerelease: false },
    },
    expectedStepOutputs: [
      { nodeId: "github", label: "Verified release event", exampleOutput: { repository: "octo-demo/community-tools", release: { tag: "v1.4.0", draft: false } } },
      {
        nodeId: "sheet",
        label: "Approved rows for v1.4.0",
        exampleOutput: {
          rowCount: 3,
          rows: [
            { contributor: "Contributor A", wallet: "{{configure_wallet}}", amount_usdc: "60", approved: "TRUE" },
            { contributor: "Contributor B", wallet: "{{configure_wallet}}", amount_usdc: "25", approved: "TRUE" },
            { contributor: "Contributor C", wallet: "{{configure_wallet}}", amount_usdc: "15", approved: "TRUE" },
          ],
        },
      },
      { nodeId: "allocate", label: "Exact allocation", exampleOutput: { symbol: "USDC", amount: "100", destinations: 3, note: "Real wallets required; placeholders fail validation." } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["source wallet", "token", "3 recipients", "fee", "payload fingerprint"] } },
      { nodeId: "discord", label: "Summary posted after the transfer settles", exampleOutput: { message: "Contributor payout for octo-demo/community-tools v1.4.0 is completed…" } },
    ],
    safetyNotes: [
      "Example only, a dry run. No funds move and no provider was called.",
      "A GitHub event only starts the run. The sheet's approved column and your wallet signature are what authorize payment.",
    ],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "github", status: "would_run", note: "Signature checked, delivery id stored so a redelivery is ignored." },
      { nodeId: "sheet", status: "would_run", note: "Reads 3 approved rows for v1.4.0." },
      { nodeId: "allocate", status: "would_stop", note: "Stops until real wallets replace the placeholders." },
      { nodeId: "approval", status: "would_wait", note: "Waits up to 24 hours for your decision." },
      { nodeId: "sign", status: "would_wait", note: "Waits for your wallet signature. Keys stay in your wallet." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "repo", title: "Sign in with GitHub", detail: "Connect GitHub and set owner/repo (you need admin access). Turning the workflow on adds the release webhook for you.", nodeIds: ["github"] },
    { id: "sheet", title: "Sign in with Google", detail: "Allow read-only Sheets access and paste the spreadsheet ID from its URL. Columns: contributor, wallet, amount_usdc, release, approved, paid.", nodeIds: ["sheet"] },
    { id: "rules", title: "Check the payout rules", detail: "Confirm the column names and consider a spending cap.", nodeIds: ["allocate"] },
    { id: "discord", title: "Connect the Discord channel", detail: "Pick the channel for payout summaries on Discord's screen.", nodeIds: ["discord"] },
    { id: "wallet", title: "Fund your wallet", detail: "Payouts come from your signed-in wallet. Hold the USDC plus a little SOL for fees.", nodeIds: ["sign"] },
  ],
  safetyNotes: [
    "Every payout waits for your approval and your wallet signature. Nothing is sent automatically.",
    "Imported workflows start off. Turn it on only after setup is complete.",
    "One MultiHopper transfer pays at most 20 distinct wallets. Larger batches stop with an explanation instead of being split.",
  ],
};
