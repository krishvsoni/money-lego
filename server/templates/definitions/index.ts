import type { TemplateDefinition } from "@/lib/templates/types";
import { discordCommunityBountyReward } from "./discord-community-bounty-reward";
import { opensourceContributorPayout } from "./opensource-contributor-payout";
import { shopifyApprovedSupplierPayout } from "./shopify-approved-supplier-payout";
import { stripePartnerRevenueAllocation } from "./stripe-partner-revenue-allocation";
import { weeklyGrantDistribution } from "./weekly-grant-distribution";

// Seed source for the published templates. The database is what the app serves; these are
// what the seed upserts into it, keyed by slug.
export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  opensourceContributorPayout,
  shopifyApprovedSupplierPayout,
  stripePartnerRevenueAllocation,
  discordCommunityBountyReward,
  weeklyGrantDistribution,
];
