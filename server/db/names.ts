// Leaf module with no imports, so migrations, locks and the client can all reference
// collection names without creating an import cycle through the connection module.

export const COLLECTIONS = {
  // Accounts live in "members". Older collections ("users", "accounts") from the wallet
  // era are left untouched; nothing reads or deletes them.
  users: "members",
  authSessions: "auth_sessions",
  rateLimits: "rate_limits",
  locks: "locks",
  workflows: "workflows",
  workflowShares: "workflow_shares",
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

// Case-insensitive comparison for member email lookups; queries must pass the same collation
// to use the index built with it.
export const EMAIL_COLLATION = { locale: "en", strength: 2 } as const;

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
