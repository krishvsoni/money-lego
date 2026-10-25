import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph, payoutEdges, payoutSteps, usdcMint } from "./build";

const g = graph(
  [
    { id: "command", type: "trigger.discord", label: "/payout-bounty", at: [0, 0], config: { command: "payout-bounty", allowedRoleId: "" } },
    {
      id: "bounty",
      type: "airtable.lookup",
      label: "Approved bounty",
      at: [1, 0],
      config: { baseId: "", table: "Bounties", matchField: "bounty_id", matchValue: "{{ trigger.options.bounty_id }}", statusField: "status", statusValue: "approved", maxRecords: 1 },
    },
    { id: "once", type: "logic.once", label: "Pay each bounty once", at: [2, 0], config: { key: "bounty:{{ trigger.options.bounty_id }}" } },
    {
      id: "allocate",
      type: "data.payout_rows",
      label: "Validate reward",
      at: [3, 0],
      config: { rows: "{{ input.rows }}", tokenMint: usdcMint(), walletField: "winner_wallet", amountField: "reward", labelField: "winner", maxTotal: "1000" },
    },
    ...payoutSteps([0, 1], "Bounty {{ trigger.options.bounty_id }}: pay {{ input.amount }} {{ input.symbol }} to the approved winner. Requested by Discord user {{ trigger.userId }}."),
    { id: "paid", type: "mh.result", label: "Transfer summary", at: [5, 1] },
    { id: "telegram", type: "notify.telegram", label: "Tell the winner", at: [5, 0], config: { message: "Your reward for bounty {{ trigger.options.bounty_id }} has arrived: {{ input.amount }}. Receipt: {{ input.receiptUrl }}" } },
    { id: "failed", type: "mh.result", label: "Failure summary", at: [5, 2] },
    {
      id: "discord",
      type: "notify.discord",
      label: "Post outcome",
      at: [6, 1],
      config: { message: "Bounty {{ trigger.options.bounty_id }} payout is {{ input.state }}: {{ input.amount }}. Run {{ run.id }}." },
    },
  ],
  [["command", "bounty"], ["bounty", "once"], ["once", "allocate"], ...payoutEdges("allocate"), ["wait", "paid"], ["paid", "telegram"], ["telegram", "discord"], ["wait", "failed", "failed"], ["failed", "discord"]],
);

export const discordCommunityBountyReward: TemplateDefinition = {
  slug: "discord-community-bounty-reward",
  name: "Community Bounty Reward",
  shortDescription: "Resolve an approved bounty winner, review the payout and notify the recipient after settlement.",
  fullDescription:
    "A moderator runs your Discord slash command with a bounty ID. Money Lego verifies the interaction, checks the moderator's role, looks up the bounty in Airtable and proceeds only if it's approved and unpaid. You review the reward and sign it in your wallet. The winner hears about it on Telegram only after the transfer completes; the outcome, success or failure, is posted to your bounty channel.",
  useCase:
    "Communities run bounties for docs, designs, bug reports and translations, then chase winners for wallets and pay by hand. This keeps Airtable as the bounty board, makes the payout a reviewed, signed step and tells winners only when the money has actually arrived.",
  howItWorks: [
    "Discord sends the slash command interaction from your server, verified with Ed25519 and a timestamp. Only members with the allowed role can start a run; chat text is never read.",
    "Airtable returns the bounty only if its status is approved.",
    "The bounty ID is claimed, so a second payout for it can't start.",
    "The winner's wallet and reward are validated against a treasury cap.",
    "MultiHopper quotes it, you review, approve and sign in your wallet.",
    "After the transfer completes, the winner gets a Telegram message. Failures go to the bounty channel, never to a guessed chat.",
  ],
  category: "Community",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 15, max: 20 },
  integrations: ["discord", "airtable", "telegram", "multihopper"],
  tags: ["community", "bounties", "rewards", "usdc"],
  thumbnailAlt: "Workflow diagram: a Discord slash command looks up an approved Airtable bounty, guards against double payment, validates the reward, then MultiHopper quote, operator review and wallet authorization, with a Telegram message on success and a Discord post for every outcome.",
  graphDefinition: g,
  exampleScenario: {
    headline: "BOUNTY-DEMO-17 is approved and its winner is paid",
    narrative:
      "A moderator runs /payout-bounty bounty_id:BOUNTY-DEMO-17. Airtable marks it approved with a reward and a winner wallet the community configured. The run validates the reward against the 1000 USDC cap and waits for review. The wallet, amount and chat below are placeholders; no real community or person is involved.",
    sampleInput: { command: "payout-bounty", options: { bounty_id: "BOUNTY-DEMO-17" }, userId: "example-user", guildId: "example-guild" },
    expectedStepOutputs: [
      { nodeId: "command", label: "Verified command", exampleOutput: { command: "payout-bounty", options: { bounty_id: "BOUNTY-DEMO-17" } } },
      { nodeId: "bounty", label: "Approved bounty record", exampleOutput: { record: { bounty_id: "BOUNTY-DEMO-17", status: "approved", winner: "Example winner", winner_wallet: "{{configure_wallet}}", reward: "{{configure_token_amount}}" } } },
      { nodeId: "once", label: "Bounty claimed", exampleOutput: { onceKey: "bounty:BOUNTY-DEMO-17" } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval" } },
      { nodeId: "telegram", label: "Sent only after completion", exampleOutput: { message: "Your reward for bounty BOUNTY-DEMO-17 has arrived…" } },
    ],
    safetyNotes: [
      "Example only, a dry run. No funds move and no message is sent.",
      "The winner is told only after the transfer is confirmed complete.",
    ],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "command", status: "would_run", note: "Signature, timestamp and role checked." },
      { nodeId: "bounty", status: "would_run", note: "Finds one approved bounty." },
      { nodeId: "allocate", status: "would_stop", note: "Stops until the record has a real wallet and reward." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "discord-app", title: "Add the bot to your server", detail: "Click Add the bot to a server, pick your server and set the moderator role ID. Turning the workflow on adds /payout-bounty there.", nodeIds: ["command"] },
    { id: "airtable", title: "Sign in with Airtable", detail: "Allow access to the bounty base and set its ID. Fields: bounty_id, status, winner, winner_wallet, reward.", nodeIds: ["bounty"] },
    { id: "cap", title: "Set the treasury cap", detail: "The largest reward one command can pay, in USDC.", nodeIds: ["allocate"] },
    { id: "telegram", title: "Link the winners' Telegram chat", detail: "Tap the link to open the Money Lego bot in that chat and press Start.", nodeIds: ["telegram"] },
    { id: "channel", title: "Connect the bounty channel", detail: "Pick the Discord channel for outcome posts on Discord's screen.", nodeIds: ["discord"] },
  ],
  safetyNotes: [
    "Every reward waits for your approval and wallet signature.",
    "Only members with the role you set can start a payout, and only through the command's options.",
    "A bounty pays once, however many times the command runs.",
  ],
};
