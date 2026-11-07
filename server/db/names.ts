// Leaf module with no imports, so migrations, locks and the client can all reference
// collection names without creating an import cycle through the connection module.

export const COLLECTIONS = {
  // Accounts live in "members". Older collections ("users", "accounts") from the wallet
  // era are left untouched; nothing reads or deletes them.
  users: "members",
  rateLimits: "rate_limits",
  locks: "locks",
  workflows: "workflows",
  workflowVersions: "workflow_versions",
  workflowRuns: "workflow_runs",
  nodeRuns: "node_runs",
  credentials: "credentials",
  workflowTemplates: "workflow_templates",
  onceKeys: "once_keys",
  oauthStates: "oauth_states",
  telegramLinks: "telegram_links",
  paypalEvents: "paypal_events",
  paypalResources: "paypal_resources",
} as const;

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
