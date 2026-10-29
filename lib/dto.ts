import type { ExecutionState } from "./execution-states";
import type { RecipeConfig } from "./recipe-schema";

// Wire shapes shared by API routes and the UI. Ids are hex strings, dates ISO strings.

export interface QuoteDTO {
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
  isTest: boolean;
  quotedAt: string;
  expiresAt: string | null;
}

export interface RecoveryDTO {
  canRescue: boolean;
  rescuableLamports: number;
  canReclaimRent: boolean;
  reclaimableLamports: number;
}

export interface RecoveryBundleDTO {
  kind: "rescue" | "reclaim";
  txs: string[];
  lastValidBlockHeight: number | null;
  totalLamports: number;
}

export interface ExecutionDTO {
  id: string;
  workflowRunId: string | null;
  recipeId: string;
  recipeName: string;
  recipeVersion: number;
  state: ExecutionState;
  sourceWallet: string;
  amountRaw: string;
  config: RecipeConfig;
  providerTransferId: number | null;
  supportBundleId: string | null;
  providerStatus: string | null;
  providerPhase: string | null;
  progress: { hopsCompleted: number; hopsTotal: number } | null;
  quote: QuoteDTO | null;
  recovery: RecoveryDTO | null;
  signatures: Array<{ kind: string; signature: string; index: number; recordedAt: string }>;
  destinations: Array<{ wallet: string; amountRaw: string; status: string; payoutSignature: string | null; paidAt: string | null }>;
  timeline: Array<{ at: string; state: ExecutionState; note: string; source: string }>;
  lastError: { code: string; message: string; at: string } | null;
  shareToken: string;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptDTO {
  recipeName: string;
  state: ExecutionState;
  tokenMint: string;
  amountRaw: string;
  recipientReceivesRaw: string | null;
  supportBundleId: string | null;
  destinations: Array<{ wallet: string; amountRaw: string; status: string; payoutSignature: string | null }>;
  signatures: Array<{ kind: string; signature: string }>;
  createdAt: string;
  completedAt: string | null;
}

export interface PreparedBundleDTO {
  keeperFundingTx: string | null;
  routeInitTxs: string[];
  orchestratorInitTx: string | null;
  sessionInitTxs: string[];
  dispersionInitTxs: string[];
  lastValidBlockHeight: number | null;
  nothingToDo: boolean;
}

export interface ApiErrorBody {
  error: { code: string; message: string; issues?: Array<{ path: string; message: string }>; requestId?: string };
}
