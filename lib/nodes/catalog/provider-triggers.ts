import { MAIN_OUT, type NodeDefinition } from "../types";

// Inbound events from named providers. Each is verified with that provider's own signing
// scheme over the raw request body (server/engine/inbound) and deduplicated by the
// provider's delivery or event id, so a redelivery never starts a second run. A verified
// event proves who sent it, not that money is owed: payouts still need approval and a wallet.

export const providerTriggerNodes: NodeDefinition[] = [
  {
    type: "trigger.github",
    summary: "Start on a signed GitHub release or merged PR.",
    title: "GitHub event",
    category: "triggers",
    description: "Start when GitHub delivers a release or pull request event. Turning the workflow on adds a signed webhook to the repository with your GitHub sign-in; turning it off removes it. Other events are ignored.",
    icon: "GithubLogo",
    provider: "github",
    fields: [
      { key: "credentialId", label: "GitHub account", kind: "credential", credentialType: "github_account", required: true, help: "You need admin access to the repository." },
      {
        key: "event",
        label: "Event",
        kind: "select",
        required: true,
        options: [
          { value: "release.published", label: "Release published" },
          { value: "pull_request.merged", label: "Pull request merged" },
        ],
      },
      { key: "repository", label: "Repository", kind: "text", required: true, placeholder: "owner/repo", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", patternMessage: "Use owner/repo" },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { event: "release.published" },
    retrySafe: true,
    outputHint: "{ event, deliveryId, repository, release?: { tag, name, draft, prerelease, url }, pullRequest?: { number, mergeSha, baseRef, url }, sender }.",
  },
  {
    type: "trigger.stripe",
    summary: "Start on a verified Stripe event.",
    title: "Stripe event",
    category: "triggers",
    description: "Start when your connected Stripe account has an invoice paid. Events come through Money Lego's verified Stripe Connect endpoint with a 5 minute timestamp tolerance. A paid invoice is a business signal; it does not fund a Solana wallet.",
    icon: "StripeLogo",
    provider: "stripe",
    fields: [
      { key: "credentialId", label: "Stripe account", kind: "credential", credentialType: "stripe_account", required: true },
      { key: "eventType", label: "Event", kind: "select", required: true, options: [{ value: "invoice.paid", label: "invoice.paid" }] },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { eventType: "invoice.paid" },
    retrySafe: true,
    outputHint: "{ eventId, type, account, livemode, invoice: { id, status, amountPaid, currency, customerId } }.",
  },
  {
    type: "trigger.shopify",
    summary: "Start on a verified paid Shopify order.",
    title: "Shopify order paid",
    category: "triggers",
    description: "Start when your connected store reports an order paid, verified with Shopify's HMAC over the raw body. Shopify's fiat settlement never reaches a Solana wallet through this event.",
    icon: "Storefront",
    provider: "shopify",
    fields: [
      { key: "credentialId", label: "Store", kind: "credential", credentialType: "shopify_store", required: true },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: {},
    retrySafe: true,
    outputHint: "{ eventId, topic, shop, order: { id, name, financialStatus, currency, totalPrice, cancelled, skus } }. No customer details are kept.",
  },
  {
    type: "trigger.discord",
    summary: "Start from a verified Discord slash command.",
    title: "Discord command",
    category: "triggers",
    description: "Start when someone with the allowed role runs the slash command in your server. Turning the workflow on registers the command there. Interactions are verified with Ed25519; only the command's options are read, never chat text.",
    icon: "DiscordLogo",
    provider: "discord",
    fields: [
      { key: "credentialId", label: "Discord server", kind: "credential", credentialType: "discord_server", required: true },
      { key: "command", label: "Command name", kind: "text", required: true, placeholder: "payout-bounty", pattern: "^[a-z0-9_-]{1,32}$", patternMessage: "Lowercase letters, digits, - and _" },
      { key: "allowedRoleId", label: "Allowed role ID", kind: "text", required: true, placeholder: "123456789012345678", pattern: "^\\d{17,20}$", patternMessage: "A Discord role ID (digits)", help: "Only members with this role can start a run." },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { command: "payout-bounty" },
    retrySafe: true,
    outputHint: "{ interactionId, guildId, channelId, userId, command, options: { name: value } }.",
  },
];
