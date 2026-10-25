import {
  DiscordLogoIcon, FingerprintIcon, GithubLogoIcon, GoogleLogoIcon, LockKeyIcon, NotionLogoIcon, SlackLogoIcon, StorefrontIcon, StripeLogoIcon, TableIcon,
  TelegramLogoIcon, type Icon,
} from "@phosphor-icons/react";
import type { Brand } from "@/components/ui/brand-logo";
import { CREDENTIAL_TYPES as TYPES, MANUAL_CREDENTIAL_TYPES, type CredentialType, type ManualCredentialType } from "@/lib/nodes/types";

// What each kind of credential is for, in the words of the person adding it, and which
// inputs it takes. The picker, the form and the saved list all read from here, so a new
// kind is one entry. Field rules mirror the server's schema; the server still decides.

export interface CredentialInputSpec {
  key: string;
  label: string;
  kind: "text" | "secret" | "textarea";
  placeholder?: string;
  hint?: string;
  optional?: boolean;
  pattern?: RegExp;
  patternMessage?: string;
}

export interface CredentialMeta {
  label: string;
  blurb: string;
  icon: Icon;
  color: string;
  inputs: CredentialInputSpec[];
  // We generate the secret on save and show it once.
  generates?: boolean;
  // The service's official mark, when it has one.
  brand?: Brand;
}


const connection = (label: string, blurb: string, icon: Icon, color: string, brand: Brand): CredentialMeta => ({ label, blurb, icon, color, inputs: [], brand });

export const CREDENTIAL_META: Record<CredentialType, CredentialMeta> = {
  webhook_secret: { label: "Webhook signing secret", blurb: "Verify events your own app sends to start a workflow.", icon: FingerprintIcon, color: "var(--brick-2)", inputs: [], generates: true },
  http_header: {
    label: "HTTP auth header",
    blurb: "Call your own API with your own token.",
    icon: LockKeyIcon,
    color: "var(--brick-1)",
    inputs: [
      { key: "header", label: "Header", kind: "text", placeholder: "Authorization", pattern: /^[A-Za-z0-9-]{1,64}$/, patternMessage: "Letters, digits and dashes" },
      { key: "value", label: "Value", kind: "secret", placeholder: "Bearer …", hint: "Stored encrypted. Never sent back to the browser." },
    ],
  },
  github_account: connection("GitHub account", "Signed in with GitHub.", GithubLogoIcon, "#24292f", "github"),
  google_account: connection("Google account", "Signed in with Google, read-only Sheets.", GoogleLogoIcon, "#188038", "google-sheets"),
  slack_webhook: connection("Slack channel", "Added to Slack for one channel.", SlackLogoIcon, "#7A3E8F", "slack"),
  discord_webhook: connection("Discord channel", "Connected to one Discord channel.", DiscordLogoIcon, "#5865F2", "discord"),
  discord_server: connection("Discord server", "Bot added for the slash command.", DiscordLogoIcon, "#5865F2", "discord"),
  stripe_account: connection("Stripe account", "Connected read-only with Stripe.", StripeLogoIcon, "#635BFF", "stripe"),
  shopify_store: connection("Shopify store", "Connected store, read orders only.", StorefrontIcon, "#5E8E3E", "shopify"),
  airtable_account: connection("Airtable account", "Signed in with Airtable, read-only.", TableIcon, "#D6A21E", "airtable"),
  notion_workspace: connection("Notion workspace", "Only the pages you shared.", NotionLogoIcon, "#191919", "notion"),
  telegram_chat: connection("Telegram chat", "Linked through the Money Lego bot.", TelegramLogoIcon, "#229ED9", "telegram"),
};

export const CREDENTIAL_TYPES: CredentialType[] = [...TYPES];
export const MANUAL_TYPES: ManualCredentialType[] = [...MANUAL_CREDENTIAL_TYPES];
export const isManual = (t: CredentialType): t is ManualCredentialType => (MANUAL_CREDENTIAL_TYPES as readonly string[]).includes(t);

export const CREDENTIAL_LABEL = Object.fromEntries(CREDENTIAL_TYPES.map((t) => [t, CREDENTIAL_META[t].label])) as Record<CredentialType, string>;
