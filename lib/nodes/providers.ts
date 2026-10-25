import type { CredentialType } from "./types";

// The outside services Money Lego connects to, named the way people know them. Template
// badges, node badges and setup checklists all read from here.

export interface Provider {
  id: string;
  label: string;
  color: string;
  credential: CredentialType | null;
  // What the person needs before this provider works, in one line.
  setup: string;
}

export const PROVIDERS: Record<string, Provider> = {
  multihopper: { id: "multihopper", label: "MultiHopper", color: "#2c4bd6", credential: null, setup: "Configured on the server. You sign every transfer in your own wallet." },
  github: { id: "github", label: "GitHub", color: "#24292f", credential: "github_account", setup: "Sign in with GitHub. The repository webhook is added for you when the workflow turns on." },
  "google-sheets": { id: "google-sheets", label: "Google Sheets", color: "#188038", credential: "google_account", setup: "Sign in with Google and allow read-only access to Sheets." },
  discord: { id: "discord", label: "Discord", color: "#5865F2", credential: "discord_webhook", setup: "Pick a channel on Discord's screen (and, for commands, add the bot to your server)." },
  slack: { id: "slack", label: "Slack", color: "#4A154B", credential: "slack_webhook", setup: "Click Add to Slack and pick the channel." },
  stripe: { id: "stripe", label: "Stripe", color: "#635BFF", credential: "stripe_account", setup: "Connect with Stripe (read-only). Invoice events arrive automatically." },
  shopify: { id: "shopify", label: "Shopify", color: "#5E8E3E", credential: "shopify_store", setup: "Connect your store. The order-paid webhook is registered for you." },
  telegram: { id: "telegram", label: "Telegram", color: "#229ED9", credential: "telegram_chat", setup: "Tap the link to open our bot in the chat you want to notify." },
  notion: { id: "notion", label: "Notion", color: "#191919", credential: "notion_workspace", setup: "Connect Notion and pick the pages it may use." },
  airtable: { id: "airtable", label: "Airtable", color: "#D6A21E", credential: "airtable_account", setup: "Sign in with Airtable and choose the bases." },
  http: { id: "http", label: "HTTP Request", color: "#3c8dbc", credential: "http_header", setup: "Point it at your own HTTPS endpoint, with your own auth header if needed." },
  schedule: { id: "schedule", label: "Schedule", color: "#e3a21a", credential: null, setup: "Pick the day, time and timezone." },
};

export function providerOf(id: string): Provider | undefined {
  return PROVIDERS[id];
}
