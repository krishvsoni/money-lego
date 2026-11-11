import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph } from "./build";

// Someone tags a teammate in Slack ("@Krish buy me flowers"); the tagged person gets a PayPal
// payment link for a real bouquet by DM, and the channel hears about it once they've paid.

const g = graph(
  [
    { id: "mention", type: "trigger.slack_mention", label: "Someone asks in Slack", at: [0, 0], config: { phrase: "buy me flowers" } },
    { id: "search", type: "shop.search", label: "Find real bouquets", at: [1, 0], config: { query: "fresh flower bouquet", maxPrice: "60", limit: 6 } },
    { id: "pick", type: "ai.pick", label: "AI picks a bouquet", at: [2, 0], config: { request: "A bouquet of fresh flowers as a gift", criteria: "In stock, well reviewed, within budget, from a well-known store." } },
    {
      id: "approval",
      type: "logic.approval",
      label: "You approve the bouquet",
      at: [3, 0],
      config: { message: "Buy {{ input.pick.title }} for {{ input.pick.price }} {{ input.pick.currency }} from {{ input.pick.merchant }}? Asked in Slack: \"{{ trigger.request }}\".", timeoutHours: 24 },
    },
    { id: "checkout", type: "paypal.checkout_link", label: "PayPal payment link", at: [0, 1], config: { productId: "{{ input.pick.id }}", note: "Flowers for a teammate" } },
    {
      id: "dm",
      type: "notify.slack_dm",
      label: "DM the link to the tagged person",
      at: [1, 1],
      config: {
        userId: "{{ trigger.taggedUserId }}",
        message: "<@{{ trigger.requesterId }}> asked you to buy flowers: {{ input.checkout.product }} ({{ input.checkout.price }} {{ input.checkout.currency }}). Pay here: {{ input.checkout.approveUrl }}",
      },
    },
    { id: "wait", type: "paypal.wait_checkout", label: "Wait for payment", at: [2, 1], config: { timeoutHours: 72 } },
    { id: "announce", type: "notify.slack", label: "Tell the channel", at: [3, 1], config: { message: "<@{{ trigger.taggedUserId }}> bought flowers for <@{{ trigger.requesterId }}>: {{ input.checkout.product }}." } },
  ],
  [["mention", "search"], ["search", "pick"], ["pick", "approval"], ["approval", "checkout", "approved"], ["checkout", "dm"], ["dm", "wait"], ["wait", "announce"]],
);

export const slackBuyMeFlowers: TemplateDefinition = {
  slug: "slack-buy-me-flowers",
  name: "Slack: Buy Me Flowers",
  shortDescription: "Tag a teammate with \"buy me flowers\" in Slack; they get a PayPal payment link by DM, and the channel hears when they've paid.",
  fullDescription:
    "A Slack message such as \"@Krish buy me flowers\" starts the run. Channel3 finds real bouquets in stock and AI picks one. You approve the exact bouquet and price. Money Lego creates a PayPal checkout and sends the link to the tagged person as a Slack direct message, waits for them to pay, and posts in the channel you choose that they bought flowers for whoever asked.",
  useCase: "Small teams turn a friendly Slack request into a real purchase: the person asked gets a payment link straight away, and everyone sees when it's done.",
  howItWorks: [
    "Someone writes \"buy me flowers\" in Slack and tags a teammate.",
    "Channel3 finds real bouquets in stock within the budget, and AI picks one.",
    "You approve the exact bouquet, store and price.",
    "PayPal creates a checkout at the re-checked price, and the tagged person gets the link as a Slack DM.",
    "They pay on PayPal. Once it's captured, the channel is told who bought flowers for whom.",
  ],
  category: "Agentic Commerce",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 5, max: 10 },
  integrations: ["slack", "channel3", "paypal"],
  tags: ["slack", "paypal", "channel3", "checkout", "dm"],
  thumbnailAlt: "Workflow diagram: a Slack mention finds bouquets on Channel3, AI picks one, the owner approves, a PayPal payment link is sent by Slack DM, and the channel is told once it's paid.",
  graphDefinition: g,
  exampleScenario: {
    headline: "Neha writes \"@Krish buy me flowers\"",
    narrative: "Channel3 returns six bouquets under $60. AI picks a seasonal bouquet at $45.00. You approve; Krish gets a Slack DM with the PayPal link, pays with a sandbox account, and the channel reads \"@Krish bought flowers for @Neha\".",
    sampleInput: { requesterId: "U0NEHA0001", taggedUserId: "U0KRISH001", channelId: "C0GENERAL1", request: "buy me flowers" },
    expectedStepOutputs: [
      { nodeId: "pick", label: "AI pick", exampleOutput: { pick: { title: "Seasonal bouquet", price: "45.00", currency: "USD" } } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["bouquet", "store", "45.00 USD"] } },
      { nodeId: "dm", label: "Link sent by DM", exampleOutput: { slackDm: { channel: "D0KRISHDM1" } } },
      { nodeId: "wait", label: "Paid", exampleOutput: { purchase: { status: "COMPLETED" } } },
    ],
    safetyNotes: ["Example only, a dry run.", "PayPal Sandbox: pay with a test account."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "search", status: "would_run", note: "Reads product data only." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
      { nodeId: "checkout", status: "would_run", note: "Only after approval, at the re-checked price." },
      { nodeId: "wait", status: "would_wait", note: "Waits for the tagged person to pay." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "slack", title: "Connect Slack", detail: "Add to Slack and pick the channel for the \"bought flowers\" message. The same connection sends the DM and listens for mentions.", nodeIds: ["mention", "dm", "announce"] },
    { id: "events", title: "Slack events", detail: "In your Slack app, set the Event Subscriptions Request URL shown on the trigger, subscribe to message.channels, and /invite the app to the channel.", nodeIds: ["mention"] },
    { id: "channel3", title: "Channel3 on the server", detail: "Set CHANNEL3_API_KEY so real bouquets can be found.", nodeIds: ["search"] },
  ],
  safetyNotes: [
    "Nothing is bought without your approval of the exact bouquet and price.",
    "If the price changes after approval, no checkout is created.",
    "Only messages containing the phrase and a tag are kept; every other Slack message is dropped unread.",
  ],
};
