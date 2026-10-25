import "server-only";
import type { Collection, Db } from "mongodb";
import { getDb } from "./client";
import type {
  CredentialDoc,
  ExecutionDoc,
  NodeRunDoc,
  WorkflowDoc,
  WorkflowRunDoc,
  WorkflowVersionDoc,
  LockDoc,
  NonceDoc,
  RateLimitDoc,
  RecipeDoc,
  RecipeVersionDoc,
  SessionDoc,
  UserDoc,
  WebhookEventDoc,
  WorkflowTemplateDoc,
  OnceKeyDoc,
  OAuthStateDoc,
  TelegramLinkDoc,
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
  workflows: Collection<WorkflowDoc>;
  workflowVersions: Collection<WorkflowVersionDoc>;
  workflowRuns: Collection<WorkflowRunDoc>;
  nodeRuns: Collection<NodeRunDoc>;
  credentials: Collection<CredentialDoc>;
  workflowTemplates: Collection<WorkflowTemplateDoc>;
  onceKeys: Collection<OnceKeyDoc>;
  oauthStates: Collection<OAuthStateDoc>;
  telegramLinks: Collection<TelegramLinkDoc>;
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
    workflows: db.collection<WorkflowDoc>(COLLECTIONS.workflows),
    workflowVersions: db.collection<WorkflowVersionDoc>(COLLECTIONS.workflowVersions),
    workflowRuns: db.collection<WorkflowRunDoc>(COLLECTIONS.workflowRuns),
    nodeRuns: db.collection<NodeRunDoc>(COLLECTIONS.nodeRuns),
    credentials: db.collection<CredentialDoc>(COLLECTIONS.credentials),
    workflowTemplates: db.collection<WorkflowTemplateDoc>(COLLECTIONS.workflowTemplates),
    onceKeys: db.collection<OnceKeyDoc>(COLLECTIONS.onceKeys),
    oauthStates: db.collection<OAuthStateDoc>(COLLECTIONS.oauthStates),
    telegramLinks: db.collection<TelegramLinkDoc>(COLLECTIONS.telegramLinks),
  };
}

export async function collections(): Promise<Collections> {
  return collectionsOf(await getDb());
}
