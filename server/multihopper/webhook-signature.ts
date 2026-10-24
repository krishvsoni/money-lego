import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// HMAC-SHA256 over the exact raw request bytes, hex encoded, keyed with the endpoint
// secret as issued (including its whsec_ prefix, matching the documented sample).
// Comparison is constant-time, and length is checked first because timingSafeEqual throws
// on unequal lengths.

export function verifyWebhookSignature(rawBody: Buffer, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const provided = header.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

// The provider documents no event id, so a hash of the verified body is the dedupe key.
export function webhookDedupeKey(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
