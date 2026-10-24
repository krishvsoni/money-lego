import { DiscordLogoIcon, FingerprintIcon, LockKeyIcon, SlackLogoIcon, type Icon } from "@phosphor-icons/react";
import type { CredentialType } from "@/lib/nodes/types";

// What each kind of credential is for, in the words of the person adding it. The picker,
// the form and the saved list all read from here, so a new kind is one entry.
export interface CredentialMeta {
  label: string;
  blurb: string;
  icon: Icon;
  color: string;
}

export const CREDENTIAL_META: Record<CredentialType, CredentialMeta> = {
  discord_webhook: {
    label: "Discord webhook",
    blurb: "Post payout updates to a channel.",
    icon: DiscordLogoIcon,
    color: "#5865F2",
  },
  slack_webhook: {
    label: "Slack webhook",
    blurb: "Send run alerts to a Slack channel.",
    icon: SlackLogoIcon,
    color: "#7A3E8F",
  },
  webhook_secret: {
    label: "Webhook signing secret",
    blurb: "Verify events that start a workflow.",
    icon: FingerprintIcon,
    color: "var(--brick-2)",
  },
  http_header: {
    label: "HTTP auth header",
    blurb: "Call your own API with a token.",
    icon: LockKeyIcon,
    color: "var(--brick-1)",
  },
};

export const CREDENTIAL_TYPES = Object.keys(CREDENTIAL_META) as CredentialType[];

export const CREDENTIAL_LABEL = Object.fromEntries(CREDENTIAL_TYPES.map((t) => [t, CREDENTIAL_META[t].label])) as Record<CredentialType, string>;

export const URL_HELP: Partial<Record<CredentialType, string>> = {
  discord_webhook: "In Discord: channel settings, Integrations, Webhooks, Copy URL.",
  slack_webhook: "In Slack: your app, Incoming Webhooks, Copy URL.",
};
