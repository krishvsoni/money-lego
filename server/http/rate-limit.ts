import "server-only";
import { collections } from "../db/collections";
import { errors } from "../errors";

// Fixed-window counter kept in Mongo, so the limit holds across every app instance rather
// than per process. One atomic upsert per request; the TTL index removes old windows.

export interface RateRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_RULES = {
  authNonce: { name: "auth-nonce", limit: 10, windowSeconds: 60 },
  authVerify: { name: "auth-verify", limit: 10, windowSeconds: 60 },
  write: { name: "write", limit: 60, windowSeconds: 60 },
  quote: { name: "quote", limit: 8, windowSeconds: 60 },
  refresh: { name: "refresh", limit: 30, windowSeconds: 60 },
  rpc: { name: "rpc", limit: 240, windowSeconds: 60 },
  save: { name: "save", limit: 120, windowSeconds: 60 },
  webhook: { name: "webhook", limit: 600, windowSeconds: 60 },
} satisfies Record<string, RateRule>;

export async function enforceRateLimit(rule: RateRule, subject: string): Promise<void> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = `${rule.name}:${subject}:${windowStart}`;
  const { rateLimits } = await collections();
  const doc = await rateLimits.findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs * 2) } },
    { upsert: true, returnDocument: "after" },
  );
  if (doc && doc.count > rule.limit) {
    throw errors.rateLimited(Math.ceil((windowStart + windowMs - Date.now()) / 1000));
  }
}
