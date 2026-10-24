import "server-only";
import type { Collection, Db } from "mongodb";
import { getDb } from "./client";
import type {
  ExecutionDoc,
  LockDoc,
  NonceDoc,
  RateLimitDoc,
  RecipeDoc,
  RecipeVersionDoc,
  SessionDoc,
  UserDoc,
  WebhookEventDoc,
} from "./types";

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

export interface Collections {
  db: Db;
  users: Collection<UserDoc>;
  nonces: Collection<NonceDoc>;
  sessions: Collection<SessionDoc>;
  recipes: Collection<RecipeDoc>;
  recipeVersions: Collection<RecipeVersionDoc>;
  executions: Collection<ExecutionDoc>;
  webhookEvents: Collection<WebhookEventDoc>;
  rateLimits: Collection<RateLimitDoc>;
  locks: Collection<LockDoc>;
}

export function collectionsOf(db: Db): Collections {
  return {
    db,
    users: db.collection<UserDoc>(COLLECTIONS.users),
    nonces: db.collection<NonceDoc>(COLLECTIONS.nonces),
    sessions: db.collection<SessionDoc>(COLLECTIONS.sessions),
    recipes: db.collection<RecipeDoc>(COLLECTIONS.recipes),
    recipeVersions: db.collection<RecipeVersionDoc>(COLLECTIONS.recipeVersions),
    executions: db.collection<ExecutionDoc>(COLLECTIONS.executions),
    webhookEvents: db.collection<WebhookEventDoc>(COLLECTIONS.webhookEvents),
    rateLimits: db.collection<RateLimitDoc>(COLLECTIONS.rateLimits),
    locks: db.collection<LockDoc>(COLLECTIONS.locks),
  };
}

export async function collections(): Promise<Collections> {
  return collectionsOf(await getDb());
}

export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
