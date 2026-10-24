import "server-only";
import { createHash } from "node:crypto";
import { fromRaw } from "@/lib/amounts";
import type { RecipeConfig } from "@/lib/recipe-schema";
import type { TokenInfo } from "@/lib/tokens";
import type { SignatureRecord } from "../db/types";
import { providerRequest } from "./http";
import {
  confirmSchema,
  estimateSchema,
  prepareSchema,
  transferSchema,
  type Estimate,
  type PrepareResult,
  type ProviderTransfer,
} from "./schemas";

// Typed MultiHopper transfer operations. Request bodies follow the documented contract:
// exactly one of recipientWallet/destinations, and standard route fields only.

function routeFields(config: RecipeConfig) {
  const fields: { hops?: number; arrivalSeconds?: number } = {};
  if (config.route.hops !== undefined) fields.hops = config.route.hops;
  if (config.route.arrivalSeconds !== undefined) fields.arrivalSeconds = config.route.arrivalSeconds;
  return fields;
}

// Idempotency keys are derived, not random: the same logical request always carries the
// same key, so a retry after a timeout resolves to the original result upstream.
export function idempotencyKey(...parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join(":")).digest("base64url").slice(0, 48);
}

export async function estimateTransfer(config: RecipeConfig, token: TokenInfo, amountRaw: string): Promise<Estimate> {
  const body = {
    tokenMint: token.mint,
    amountRaw,
    tokenDecimals: token.decimals,
    destinationCount: config.destinations.length,
    ...routeFields(config),
  };
  const json = await providerRequest("POST", "/transfers/estimate", {
    body,
    idempotencyKey: idempotencyKey("estimate", JSON.stringify(body), Math.floor(Date.now() / 30_000)),
    retries: 1,
  });
  return estimateSchema.parse(json);
}

export async function createTransfer(input: {
  config: RecipeConfig;
  token: TokenInfo;
  amountRaw: string;
  sourceOwner: string;
  externalId: string;
}): Promise<ProviderTransfer> {
  const { config, token, amountRaw } = input;
  const recipients =
    config.destinations.length === 1
      ? { recipientWallet: config.destinations[0].wallet }
      : { destinations: config.destinations.map((d) => ({ wallet: d.wallet, amountRaw: d.amountRaw })) };
  const json = await providerRequest("POST", "/transfers", {
    body: {
      tokenMint: token.mint,
      tokenDecimals: token.decimals,
      tokenSymbol: token.symbol,
      amountRaw,
      amountTokens: fromRaw(amountRaw, token.decimals),
      sourceOwner: input.sourceOwner,
      externalId: input.externalId,
      ...recipients,
      ...routeFields(config),
    },
    idempotencyKey: idempotencyKey("create", input.externalId),
  });
  return transferSchema.parse(json);
}

export async function prepareTransfer(transferId: number, attempt: number): Promise<PrepareResult> {
  const json = await providerRequest("POST", `/transfers/${transferId}/prepare`, {
    idempotencyKey: idempotencyKey("prepare", transferId, attempt),
  });
  return prepareSchema.parse(json);
}

function signaturesOf(records: SignatureRecord[], kind: SignatureRecord["kind"]): string[] {
  return records.filter((r) => r.kind === kind).sort((a, b) => a.index - b.index).map((r) => r.signature);
}

// The confirm body is assembled from signatures we have already persisted, never from
// what the browser sends in the same request.
export async function confirmBroadcast(
  transferId: number,
  stage: "funding" | "final",
  records: SignatureRecord[],
  attempt: number,
): Promise<{ status: string }> {
  const keeper = signaturesOf(records, "keeper_funding").at(-1);
  const body: Record<string, unknown> = { routeInitSignatures: stage === "final" ? signaturesOf(records, "route_init") : [] };
  if (keeper) body.keeperFundingSignature = keeper;
  if (stage === "final") {
    const orchestrator = signaturesOf(records, "orchestrator_init").at(-1);
    const session = signaturesOf(records, "session_init");
    const dispersion = signaturesOf(records, "dispersion_init");
    if (orchestrator) body.orchestratorInitSignature = orchestrator;
    if (session.length) body.sessionInitSignatures = session;
    if (dispersion.length) body.dispersionInitSignatures = dispersion;
  }
  const json = await providerRequest("POST", `/transfers/${transferId}/confirm-broadcast`, {
    body,
    idempotencyKey: idempotencyKey("confirm", transferId, stage, attempt),
  });
  return confirmSchema.parse(json).transfer;
}

// The reference documents a flat object; one guide shows { transfer }. Accept both.
function unwrapTransfer(json: unknown): ProviderTransfer {
  const candidate = (json as { transfer?: unknown } | null)?.transfer ?? json;
  return transferSchema.parse(candidate);
}

export async function getTransfer(transferId: number): Promise<ProviderTransfer> {
  return unwrapTransfer(await providerRequest("GET", `/transfers/${transferId}`));
}

export async function getTransferByExternalId(externalId: string): Promise<ProviderTransfer> {
  return unwrapTransfer(await providerRequest("GET", `/transfers/by-external/${encodeURIComponent(externalId)}`));
}
