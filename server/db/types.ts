import type { ObjectId } from "mongodb";
import type { CredentialType } from "@/lib/nodes/types";
import type { NodeRunStatus, RunStatus, WaitKind, WorkflowGraph } from "@/lib/workflow/types";
import type { TemplateChecklistItem, TemplateDefinition } from "@/lib/templates/types";
import type { PaypalResourceKind } from "@/lib/paypal/types";

// Document shapes as stored. Money amounts are integer minor units (cents) stored as
// strings next to an ISO currency code, so no stored value ever passes through a float.

// A person signs in with Clerk. identityKey = "clerk:<clerk user id>" is the unique lookup;
// everything they own references this document's _id.
export interface UserDoc {
  _id: ObjectId;
  identityKey: string;
  kind: "clerk";
  name: string;
  // Shown to the owner only. Never sent to the AI model.
  email: string | null;
  // Whether Clerk had verified that address at sign-up. Only a verified address can receive
  // shared workflows; records from before this field existed count as verified.
  emailVerified?: boolean;
  createdAt: Date;
  lastSignedInAt: Date;
}

export interface RateLimitDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

export interface LockDoc {
  _id: string;
  owner: string;
  expiresAt: Date;
}

export interface WorkflowDoc {
  _id: ObjectId;
  ownerId: ObjectId;
  name: string;
  status: "active" | "archived";
  enabled: boolean;
  currentVersion: number;
  graph: WorkflowGraph;
  triggerType: string | null;
  // Webhook triggers and PayPal checkout links are addressed by an unguessable key, never by the workflow id.
  webhookKey: string;
  schedule: { key: string; nextAt: Date } | null;
  description?: string;
  // Set when the workflow was imported from a template. A snapshot, not a live link.
  sourceTemplate?: { id: ObjectId; slug: string; revision: number; setupChecklist: TemplateChecklistItem[] } | null;
  createRequestKey?: string;
  // Where provider events for this workflow arrive, e.g. "stripe:acct_123" or "paypal:<key>".
  // Set while it's enabled so one indexed lookup finds every workflow subscribed to an event.
  inboundRoute?: string | null;
  // Provider-side hooks this workflow registered (GitHub repo webhook, Discord command),
  // with the signing secret sealed, so turning it off can remove them.
  remoteHook?: { provider: string; id: string; secretEnc?: string; target: string } | null;
  runCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// View access to one workflow for one email address. Keyed by address rather than member id,
// so a share can be made before the person has signed up and applies the moment they do.
export interface WorkflowShareDoc {
  _id: ObjectId;
  workflowId: ObjectId;
  // Lower-cased. Unique per workflow.
  email: string;
  role: "viewer" | "editor";
  invitedBy: ObjectId;
  createdAt: Date;
}

export interface WorkflowVersionDoc {
  _id: ObjectId;
  workflowId: ObjectId;
  ownerId: ObjectId;
  version: number;
  graph: WorkflowGraph;
  createdAt: Date;
}

export interface RunLogEntry {
  at: Date;
  nodeId: string | null;
  level: "info" | "warn" | "error";
  message: string;
}

export interface WorkflowRunDoc {
  _id: ObjectId;
  ownerId: ObjectId;
  workflowId: ObjectId;
  workflowName: string;
  workflowVersion: number;
  graph: WorkflowGraph;
  trigger: { type: string; key: string; payload: unknown; at: Date };
  status: RunStatus;
  waiting: { nodeId: string; kind: WaitKind; until: Date | null; ref: string | null } | null;
  log: RunLogEntry[];
  error: string | null;
  lease: { owner: string; expiresAt: Date } | null;
  nextWakeAt: Date | null;
  version: number;
  startedAt: Date;
  finishedAt: Date | null;
  updatedAt: Date;
}

export interface NodeRunDoc {
  _id: ObjectId;
  runId: ObjectId;
  ownerId: ObjectId;
  nodeId: string;
  nodeType: string;
  status: NodeRunStatus;
  port: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
  attempts: number;
  waitState: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface CredentialDoc {
  _id: ObjectId;
  ownerId: ObjectId;
  type: CredentialType;
  name: string;
  // AES-256-GCM: base64 of iv(12) | tag(16) | ciphertext. Never returned by any API.
  secret: string;
  hint: string;
  // Older credentials have no check yet; absent and null mean the same thing.
  check?: { ok: boolean; at: Date; message: string } | null;
  // Connections only: who the user signed in as (or the store, server, chat they linked),
  // the scopes the provider actually granted, and when they connected. None of it secret.
  account?: { id: string; name: string; detail?: string };
  scopes?: string[];
  connectedAt?: Date;
  createdAt: Date;
}

export interface OAuthStateDoc {
  _id: string;
  userId: ObjectId;
  type: string;
  verifierEnc: string;
  returnTo: string;
  popup: boolean;
  shop?: string;
  createdAt: Date;
  expiresAt: Date;
}

// A one-time code a user sends to the Telegram bot to link a chat to their account.
export interface TelegramLinkDoc {
  _id: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

// A published, shared starting point. The graph here is the executable source of truth;
// importing deep-copies it into a WorkflowDoc owned by the importer and never edits this.
export interface WorkflowTemplateDoc extends TemplateDefinition {
  _id: ObjectId;
  thumbnailUrl: string;
  graphSchemaVersion: number;
  isPublished: boolean;
  // Hash of the seeded definition, so re-seeding only writes when content changed.
  contentHash: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

// One business key per workflow, claimed by the run that acts on it (see logic.once).
export interface OnceKeyDoc {
  _id: ObjectId;
  workflowId: ObjectId;
  key: string;
  runId: ObjectId;
  claimedAt: Date;
}

// Every PayPal webhook delivery, stored once by PayPal's event id before anything acts on it.
export interface PaypalEventDoc {
  _id: string;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  // The Money Lego reference ("ml:<key>") found in custom_id / invoice reference, if any.
  reference: string | null;
  verified: boolean;
  summary: Record<string, unknown>;
  routed: Array<{ workflowId: ObjectId; runId: ObjectId | null }>;
  outcome: "started" | "updated" | "ignored" | "rejected";
  receivedAt: Date;
}

// Local mirror of the PayPal objects Money Lego created or observed, for the payments
// dashboard, run drill-downs and idempotency checks. The PayPal id is the source of truth.
export interface PaypalResourceDoc {
  _id: ObjectId;
  ownerId: ObjectId | null;
  workflowId: ObjectId | null;
  runId: ObjectId | null;
  nodeId: string | null;
  kind: PaypalResourceKind;
  paypalId: string;
  status: string;
  currency: string | null;
  amountMinor: string | null;
  counterparty: string | null;
  // Short, non-sensitive facts (e.g. item count, invoice number, debug id). No secrets.
  detail: Record<string, unknown>;
  environment: "sandbox" | "live";
  createdAt: Date;
  updatedAt: Date;
}
