// Leaf module with no imports, so migrations, locks and the client can all reference
// collection names without creating an import cycle through the connection module.

export const COLLECTIONS = {
  users: "users",
  nonces: "auth_nonces",
  sessions: "sessions",
  recipes: "recipes",
  recipeVersions: "recipe_versions",
  executions: "executions",
  webhookEvents: "webhook_events",
  rateLimits: "rate_limits",
  locks: "locks",
  migrations: "migrations",
} as const;

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
