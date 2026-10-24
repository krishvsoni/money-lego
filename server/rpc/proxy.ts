import "server-only";
import { clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { env } from "../config/env";
import { errors } from "../errors";
import { log } from "../log";

// The browser's only path to Solana. The upstream URL (often a paid endpoint with its key
// in the path) stays on the server, and only the four calls the signing flow needs are
// forwarded, so this can't be used as a general-purpose RPC relay.

const base64Tx = z.string().max(4_096).regex(/^[A-Za-z0-9+/=]+$/);
const signature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);
const commitment = z.object({ commitment: z.enum(["processed", "confirmed", "finalized"]).optional() }).loose();

const call = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("sendTransaction"),
    params: z.tuple([base64Tx]).rest(
      z.object({
        encoding: z.literal("base64"),
        skipPreflight: z.boolean().optional(),
        preflightCommitment: z.string().optional(),
        maxRetries: z.number().int().min(0).max(10).optional(),
      }).loose(),
    ),
  }),
  z.object({
    method: z.literal("getSignatureStatuses"),
    params: z.tuple([z.array(signature).min(1).max(32)]).rest(z.object({ searchTransactionHistory: z.boolean().optional() })),
  }),
  z.object({ method: z.literal("getBlockHeight"), params: z.array(commitment).max(1).optional() }),
  z.object({ method: z.literal("getLatestBlockhash"), params: z.array(commitment).max(1).optional() }),
]);

export const rpcRequestSchema = z
  .object({ jsonrpc: z.literal("2.0"), id: z.union([z.string().max(64), z.number().int()]) })
  .and(call);

export type RpcRequest = z.infer<typeof rpcRequestSchema>;

function upstreamUrl(): string {
  const e = env();
  return e.SOLANA_RPC_URL ?? clusterApiUrl(e.NEXT_PUBLIC_SOLANA_NETWORK);
}

export async function forwardRpc(request: RpcRequest): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(upstreamUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: request.id, method: request.method, params: request.params ?? [] }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    log.warn("rpc.unreachable", { method: request.method, error });
    throw errors.providerUnavailable(error);
  }
  const json = await res.json().catch(() => null);
  if (!json || typeof json !== "object") {
    log.warn("rpc.bad_response", { method: request.method, status: res.status });
    throw errors.provider("The Solana network didn't answer. Nothing was sent. Try again in a moment.");
  }
  return json;
}
