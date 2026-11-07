import "server-only";
import type { Collection, Db } from "mongodb";
import { getDb } from "./client";
import type {
  CredentialDoc,
  LockDoc,
  NodeRunDoc,
  OAuthStateDoc,
  OnceKeyDoc,
  PaypalEventDoc,
  PaypalResourceDoc,
  RateLimitDoc,
  TelegramLinkDoc,
  UserDoc,
  WorkflowDoc,
  WorkflowRunDoc,
  WorkflowTemplateDoc,
  WorkflowVersionDoc,
} from "./types";

import { COLLECTIONS } from "./names";

export { COLLECTIONS, isDuplicateKeyError } from "./names";

export interface Collections {
  db: Db;
  users: Collection<UserDoc>;
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
  paypalEvents: Collection<PaypalEventDoc>;
  paypalResources: Collection<PaypalResourceDoc>;
}

export function collectionsOf(db: Db): Collections {
  return {
    db,
    users: db.collection<UserDoc>(COLLECTIONS.users),
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
    paypalEvents: db.collection<PaypalEventDoc>(COLLECTIONS.paypalEvents),
    paypalResources: db.collection<PaypalResourceDoc>(COLLECTIONS.paypalResources),
  };
}

export async function collections(): Promise<Collections> {
  return collectionsOf(await getDb());
}
