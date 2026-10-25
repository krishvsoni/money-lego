// Leaf module with no imports, so migrations, locks and the client can all reference
// collection names without creating an import cycle through the connection module.

export const COLLECTIONS = {
  // Accounts live in "accounts". The old "users" collection carries a database validator
  // that requires a plaintext wallet; it is only read to carry legacy accounts over.
  users: "accounts",
  legacyUsers: "users",
  nonces: "auth_nonces",
  sessions: "sessions",
  recipes: "recipes",
  recipeVersions: "recipe_versions",
  executions: "executions",
  webhookEvents: "webhook_events",
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
} as const;

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
