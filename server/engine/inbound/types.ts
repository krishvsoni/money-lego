import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// What a provider verifier decides about one delivery. Verifiers are pure: given the raw
// body, headers, the node's config and the decrypted secret, they either accept the event
// (with a delivery key for idempotency and a minimal payload), ignore it, answer a
// handshake, or throw InboundRejected when the signature or timestamp is wrong.

export interface InboundRequest {
  raw: Buffer;
  headers: Headers;
  config: Record<string, unknown>;
  secret: string;
  nowMs: number;
}

export type InboundDecision =
  | { kind: "run"; key: string; payload: Record<string, unknown>; reply?: unknown }
  | { kind: "ignore"; reason: string; reply?: unknown }
  | { kind: "handshake"; reply: unknown };

export class InboundRejected extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InboundRejected";
  }
}

export const REPLAY_WINDOW_MS = 5 * 60_000;

export function hmacMatches(algorithmKey: string, raw: Buffer | string, given: string, encoding: "hex" | "base64"): boolean {
  const expected = createHmac("sha256", algorithmKey).update(raw).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(given, encoding);
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function parseJsonBody(raw: Buffer): Record<string, unknown> {
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Reported as a rejection below.
  }
  throw new InboundRejected("Body isn't a JSON object.");
}

export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const text = (v: unknown, max = 200): string | null => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : null);
