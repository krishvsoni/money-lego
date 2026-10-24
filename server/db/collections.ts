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

import { COLLECTIONS } from "./names";

export { COLLECTIONS, isDuplicateKeyError } from "./names";

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
