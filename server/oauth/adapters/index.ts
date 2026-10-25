import "server-only";
import type { ConnectionType } from "@/lib/nodes/types";
import type { Adapter } from "../types";
import { airtable, github, google, notion } from "./accounts";
import { shopify, stripe } from "./commerce";
import { discordChannel, discordServer, slack } from "./messaging";

const ADAPTERS: Partial<Record<ConnectionType, Adapter>> = {
  github_account: github,
  google_account: google,
  slack_webhook: slack,
  discord_webhook: discordChannel,
  discord_server: discordServer,
  stripe_account: stripe,
  shopify_store: shopify,
  airtable_account: airtable,
  notion_workspace: notion,
};

export function adapterFor(type: string): Adapter | undefined {
  return ADAPTERS[type as ConnectionType];
}
