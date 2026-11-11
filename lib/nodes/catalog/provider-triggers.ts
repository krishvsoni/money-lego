import { CURRENCIES, PAYPAL_EVENTS } from "../../paypal/types";
import { MAIN_OUT, type ConfigIssue, type NodeDefinition } from "../types";

// Inbound events from named providers. Each is verified with that provider's own scheme
// (PayPal: signature postback; others: HMAC/Ed25519 over the raw body) and deduplicated by
// the provider's event id, so a redelivery never starts a second run. A verified event
// proves who sent it; anything that moves money still waits for a human approval.

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

function checkoutIssues(config: Record<string, unknown>): ConfigIssue[] {
  const amount = String(config.amount ?? "").trim();
  if (amount && (!/^\d{1,7}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) return [{ field: "amount", message: "Use a price like 100 or 49.99" }];
  return [];
}

const SAMPLE_CAPTURE = JSON.stringify(
  {
    source: "test",
    eventType: "PAYMENT.CAPTURE.COMPLETED",
    orderId: "TEST-ORDER",
    captureId: "TEST-CAPTURE",
    status: "COMPLETED",
    currency: "USD",
    amount: "100.00",
    amountMinor: "10000",
    fee: "3.98",
    net: "96.02",
    netMinor: "9602",
    payer: { id: "TESTPAYER", country: "US" },
  },
  null,
  2,
);

export const providerTriggerNodes: NodeDefinition[] = [
  {
    type: "trigger.paypal_checkout",
    summary: "Start when a buyer pays your PayPal checkout link.",
    title: "PayPal checkout paid",
    category: "triggers",
    description:
      "Gives this workflow a hosted PayPal checkout page. When a buyer pays and the capture is COMPLETED, the run starts with the capture details straight from PayPal. The verified PAYMENT.CAPTURE.COMPLETED webhook for the same capture never starts a second run. Pending or denied captures never start it.",
    icon: "logo:paypal",
    provider: "paypal",
    fields: [
      { key: "itemName", label: "What the buyer pays for", kind: "text", required: true, maxLength: 120, placeholder: "Brand strategy session" },
      { key: "amount", label: "Price", kind: "text", required: true, placeholder: "100.00", help: "Set here, never by the buyer's browser." },
      { key: "currency", label: "Currency", kind: "select", required: true, options: currencyOptions },
      { key: "description", label: "Description on the checkout page", kind: "textarea", maxLength: 300 },
      { key: "samplePayload", label: "Test payload", kind: "json", help: "Used when you click Run in the editor. Real payments use PayPal's capture data instead." },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { itemName: "", amount: "100.00", currency: "USD", description: "", samplePayload: SAMPLE_CAPTURE },
    retrySafe: true,
    outputHint: "{ source, orderId, captureId, status, currency, amount, amountMinor, fee, net, netMinor, payer: { id, country } } from PayPal. Amounts are decimal strings; *Minor are cents.",
    validate: checkoutIssues,
  },
  {
    type: "trigger.paypal_event",
    summary: "Start on a verified PayPal webhook event.",
    title: "PayPal event",
    category: "triggers",
    description:
      "Start when PayPal sends a verified webhook event about an object your workspace created (a checkout order, invoice or payout). Every delivery is verified with PayPal's signature API and stored once by event id before anything runs.",
    icon: "logo:paypal",
    provider: "paypal",
    fields: [
      { key: "eventType", label: "Event", kind: "select", required: true, options: PAYPAL_EVENTS.map((e) => ({ value: e.value, label: `${e.label} (${e.value})` })) },
      { key: "samplePayload", label: "Test payload", kind: "json", help: "Used when you click Run in the editor." },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { eventType: "INVOICING.INVOICE.PAID", samplePayload: '{ "eventType": "INVOICING.INVOICE.PAID", "resourceId": "INV2-TEST", "source": "test" }' },
    retrySafe: true,
    outputHint: "{ eventId, eventType, resourceType, resourceId, reference, resource: { id, status, amount, currency, … } } with customer details removed.",
  },
  {
    type: "trigger.github",
    summary: "Start on a signed GitHub release or merged PR.",
    title: "GitHub event",
    category: "triggers",
    description: "Start when GitHub delivers a release or pull request event. Turning the workflow on adds a signed webhook to the repository with your GitHub sign-in; turning it off removes it. Other events are ignored.",
    icon: "logo:github",
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
    type: "trigger.shopify",
    summary: "Start on a verified paid Shopify order.",
    title: "Shopify order paid",
    category: "triggers",
    description: "Start when your connected store reports an order paid, verified with Shopify's HMAC over the raw body.",
    icon: "logo:shopify",
    provider: "shopify",
    fields: [{ key: "credentialId", label: "Store", kind: "credential", credentialType: "shopify_store", required: true }],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: {},
    retrySafe: true,
    outputHint: "{ eventId, topic, shop, order: { id, name, financialStatus, currency, totalPrice, cancelled, skus } }. No customer details are kept.",
  },
  {
    type: "trigger.slack_mention",
    summary: "Start when someone tags a person in Slack with a phrase.",
    title: "Slack mention",
    category: "triggers",
    description:
      "Start when someone in your Slack workspace writes a message that contains the phrase and tags a person, for example \"@Krish buy me flowers\". Deliveries are verified with Slack's signing secret. Only matching messages are kept; every other message is dropped unread. Invite the Money Lego app to the channel so it can see messages there.",
    icon: "logo:slack",
    provider: "slack",
    fields: [
      { key: "credentialId", label: "Slack workspace", kind: "credential", credentialType: "slack_webhook", required: true, help: "Any Slack connection in the workspace to listen to." },
      { key: "phrase", label: "Phrase", kind: "text", required: true, maxLength: 80, placeholder: "buy me flowers", help: "The message must contain this, in any case." },
      {
        key: "taggedUserId",
        label: "Tagged person",
        kind: "text",
        placeholder: "krish@company.com",
        pattern: "^([UW][A-Z0-9]{6,}|[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+)?$",
        patternMessage: "The person's Slack email, or a member ID like U0123ABCD",
        help: "Optional. Only start when this person is tagged: their Slack email or member ID. Empty: the first person tagged.",
      },
      { key: "samplePayload", label: "Test payload", kind: "json", help: "Used when you click Run in the editor." },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: {
      phrase: "buy me flowers",
      taggedUserId: "",
      samplePayload: JSON.stringify({ requesterId: "U0NEHA0001", taggedUserId: "U0KRISH001", channelId: "C0GENERAL1", request: "buy me flowers", source: "test" }, null, 2),
    },
    retrySafe: true,
    outputHint: "{ eventId, teamId, channelId, requesterId, taggedUserId, request, ts }. Write <@{{ trigger.taggedUserId }}> in a Slack message to tag that person.",
  },
  {
    type: "trigger.discord",
    summary: "Start from a verified Discord slash command.",
    title: "Discord command",
    category: "triggers",
    description: "Start when someone with the allowed role runs the slash command in your server. Turning the workflow on registers the command there. Interactions are verified with Ed25519; only the command's options are read, never chat text.",
    icon: "logo:discord",
    provider: "discord",
    fields: [
      { key: "credentialId", label: "Discord server", kind: "credential", credentialType: "discord_server", required: true },
      { key: "command", label: "Command name", kind: "text", required: true, placeholder: "request-payout", pattern: "^[a-z0-9_-]{1,32}$", patternMessage: "Lowercase letters, digits, - and _" },
      { key: "allowedRoleId", label: "Allowed role ID", kind: "text", required: true, placeholder: "123456789012345678", pattern: "^\\d{17,20}$", patternMessage: "A Discord role ID (digits)", help: "Only members with this role can start a run." },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { command: "request-payout" },
    retrySafe: true,
    outputHint: "{ interactionId, guildId, channelId, userId, command, options: { name: value } }.",
  },
];
