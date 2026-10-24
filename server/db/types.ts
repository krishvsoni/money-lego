import type { ObjectId } from "mongodb";
import type { RecipeConfig } from "@/lib/recipe-schema";
import type { ExecutionState } from "@/lib/execution-states";
import type { CredentialType } from "@/lib/nodes/types";
import type { NodeRunStatus, RunStatus, WaitKind, WorkflowGraph } from "@/lib/workflow/types";

// Document shapes as stored. Token amounts are base-unit integer strings; Mongo's numeric
// types either lose precision (double) or cap at 2^63 (long), and u64 token supplies can
// exceed that, so strings plus a $jsonSchema digit pattern is the exact representation.

export interface UserDoc {
  _id: ObjectId;
  wallet: string;
  createdAt: Date;
  lastSignedInAt: Date;
}

export interface NonceDoc {
  _id: string;
  wallet: string;
  domain: string;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface SessionDoc {
  _id: string;
  userId: ObjectId;
  wallet: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface RecipeDoc {
  _id: ObjectId;
  ownerId: ObjectId;
  name: string;
  description: string;
  status: "active" | "archived";
  currentVersion: number;
  config: RecipeConfig;
  runCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeVersionDoc {
  _id: ObjectId;
  recipeId: ObjectId;
  ownerId: ObjectId;
  version: number;
  name: string;
  config: RecipeConfig;
  createdAt: Date;
}

export interface QuoteSnapshot {
  amountRaw: string;
  recipientReceivesRaw: string;
  percentFeeRaw: string;
  percentFeeBps: number | null;
  totalFlatFeeLamports: number | null;
  requiredSolUpFrontLamports: number | null;
  refundableLamports: number | null;
  destinationsNet: Array<{ wallet: string; amountRaw: string }>;
  hops: number;
  arrivalSeconds: number;
  pricingTier: string | null;
  isTest: boolean;
  quotedAt: Date;
  expiresAt: Date | null;
}

export type SignatureKind = "keeper_funding" | "route_init" | "orchestrator_init" | "session_init" | "dispersion_init";

export interface SignatureRecord {
  kind: SignatureKind;
  signature: string;
  index: number;
  recordedAt: Date;
}

export interface TimelineEvent {
  at: Date;
  state: ExecutionState;
  note: string;
  source: "app" | "wallet" | "provider" | "webhook" | "reconciler";
}

export interface DestinationOutcome {
  wallet: string;
  amountRaw: string;
  status: "pending" | "paid";
  payoutSignature: string | null;
  paidAt: Date | null;
}

export interface ExecutionDoc {
  _id: ObjectId;
  source: { workflowId: ObjectId; workflowRunId: ObjectId; nodeId: string } | null;
  ownerId: ObjectId;
  recipeId: ObjectId;
  recipeVersion: number;
  recipeName: string;
  requestKey: string;
  externalId: string;
  sourceWallet: string;
  snapshot: RecipeConfig;
  amountRaw: string;
  state: ExecutionState;
  providerTransferId: number | null;
  supportBundleId: string | null;
  providerStatus: string | null;
  providerPhase: string | null;
  progress: { hopsCompleted: number; hopsTotal: number } | null;
  quote: QuoteSnapshot | null;
  signatures: SignatureRecord[];
  destinations: DestinationOutcome[];
  timeline: TimelineEvent[];
  lastError: { code: string; message: string; at: Date } | null;
  prepareAttempts: number;
  confirmAttempts: number;
  shareToken: string;
  lease: { owner: string; expiresAt: Date } | null;
  nextCheckAt: Date | null;
  lastCheckedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEventDoc {
  _id: ObjectId;
  dedupeKey: string;
  eventType: string | null;
  providerTransferId: number | null;
  receivedAt: Date;
  processedAt: Date | null;
  outcome: "pending" | "applied" | "ignored" | "failed";
  attempts: number;
  payload: unknown;
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

export interface MigrationDoc {
  _id: string;
  appliedAt: Date;
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
  // Webhook triggers are addressed by an unguessable key, never by the workflow id.
  webhookKey: string;
  schedule: { intervalMinutes: number; nextAt: Date } | null;
  runCount: number;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
}
