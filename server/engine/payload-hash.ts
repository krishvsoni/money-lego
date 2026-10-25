import "server-only";
import { createHash } from "node:crypto";
import { asObject } from "./types";

// A fingerprint of exactly what would be paid: token, wallets and base-unit amounts. The
// approval shows it and records it; the transfer recomputes it and refuses to quote
// anything different from what the person approved.
export function payoutHash(input: unknown): string | null {
  const o = asObject(input);
  if (typeof o.tokenMint !== "string" || !Array.isArray(o.destinations)) return null;
  const destinations = (o.destinations as Array<Record<string, unknown>>).map((d) => [String(d.wallet ?? ""), String(d.amountRaw ?? "")]);
  return createHash("sha256").update(JSON.stringify([o.tokenMint, destinations])).digest("hex");
}
