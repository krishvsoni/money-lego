import type { ConnectionType } from "../nodes/types";

// What each connection asks the user to approve, in plain words. The server requests
// exactly these scopes and the Connections page shows the ones actually granted, so the
// user always sees what Money Lego can do with their account.

export interface Permission {
  scope: string;
  label: string;
}

export interface ConnectionInfo {
  type: ConnectionType;
  // URL slug for /api/connections/<slug>/start and /callback.
  slug: string;
  provider: string;
  label: string;
  action: string;
  blurb: string;
  method: "oauth" | "telegram";
  // Shopify needs the store domain before it can send you to the right consent page.
  asks?: "shop";
  permissions: Permission[];
  // Scopes the integration can't work without; a connection missing one is flagged.
  required: string[];
}

export const CONNECTIONS: ConnectionInfo[] = [
  {
    type: "github_account",
    slug: "github",
    provider: "github",
    label: "GitHub",
    action: "Sign in with GitHub",
    blurb: "Start workflows from releases and merged pull requests.",
    method: "oauth",
    permissions: [
      { scope: "admin:repo_hook", label: "Add and remove the release webhook on repositories you choose" },
      { scope: "read:user", label: "See your username" },
    ],
    required: ["admin:repo_hook"],
  },
  {
    type: "google_account",
    slug: "google",
    provider: "google-sheets",
    label: "Google Sheets",
    action: "Sign in with Google",
    blurb: "Read approved payout rows from your sheets.",
    method: "oauth",
    permissions: [
      { scope: "https://www.googleapis.com/auth/spreadsheets.readonly", label: "Read your Google Sheets (never edit them)" },
      { scope: "email", label: "See your email address" },
    ],
    required: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  },
  {
    type: "slack_webhook",
    slug: "slack",
    provider: "slack",
    label: "Slack",
    action: "Add to Slack",
    blurb: "Post payout updates to a channel you pick.",
    method: "oauth",
    permissions: [{ scope: "incoming-webhook", label: "Post messages to the one channel you pick" }],
    required: ["incoming-webhook"],
  },
  {
    type: "discord_webhook",
    slug: "discord",
    provider: "discord",
    label: "Discord channel",
    action: "Connect a Discord channel",
    blurb: "Post payout updates to a channel you pick.",
    method: "oauth",
    permissions: [{ scope: "webhook.incoming", label: "Post messages to the one channel you pick" }],
    required: ["webhook.incoming"],
  },
  {
    type: "discord_server",
    slug: "discord-bot",
    provider: "discord",
    label: "Discord server",
    action: "Add the bot to a server",
    blurb: "Let moderators start payouts with a slash command.",
    method: "oauth",
    permissions: [
      { scope: "applications.commands", label: "Add the payout slash command to your server" },
      { scope: "bot", label: "Receive that command (no message reading, no other permissions)" },
    ],
    required: ["applications.commands", "bot"],
  },
  {
    type: "stripe_account",
    slug: "stripe",
    provider: "stripe",
    label: "Stripe",
    action: "Connect with Stripe",
    blurb: "Start workflows when your invoices are paid.",
    method: "oauth",
    permissions: [{ scope: "read_only", label: "Read-only access: receive your invoice events, change nothing" }],
    required: ["read_only"],
  },
  {
    type: "shopify_store",
    slug: "shopify",
    provider: "shopify",
    label: "Shopify",
    action: "Connect your store",
    blurb: "Start workflows when orders are paid.",
    method: "oauth",
    asks: "shop",
    permissions: [{ scope: "read_orders", label: "Read orders and receive order-paid events" }],
    required: ["read_orders"],
  },
  {
    type: "airtable_account",
    slug: "airtable",
    provider: "airtable",
    label: "Airtable",
    action: "Sign in with Airtable",
    blurb: "Look up approved suppliers and bounties.",
    method: "oauth",
    permissions: [
      { scope: "data.records:read", label: "Read records in the bases you choose" },
      { scope: "schema.bases:read", label: "See the tables and fields in those bases" },
      { scope: "user.email:read", label: "See your email address" },
    ],
    required: ["data.records:read"],
  },
  {
    type: "notion_workspace",
    slug: "notion",
    provider: "notion",
    label: "Notion",
    action: "Connect Notion",
    blurb: "Read policy pages and record payout runs.",
    method: "oauth",
    permissions: [{ scope: "pages", label: "Read and add pages only in the pages and databases you pick in Notion" }],
    required: [],
  },
  {
    type: "telegram_chat",
    slug: "telegram",
    provider: "telegram",
    label: "Telegram",
    action: "Link a Telegram chat",
    blurb: "Message a chat when a payout lands.",
    method: "telegram",
    permissions: [{ scope: "chat", label: "Send messages to the one chat you link (the bot can't read your other chats)" }],
    required: [],
  },
];

export const connectionInfo = (type: string) => CONNECTIONS.find((c) => c.type === type);
export const connectionBySlug = (slug: string) => CONNECTIONS.find((c) => c.slug === slug);

export function missingPermissions(type: string, granted: string[]): string[] {
  const info = connectionInfo(type);
  return (info?.required ?? []).filter((s) => !granted.includes(s));
}
