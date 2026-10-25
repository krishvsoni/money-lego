import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { ObjectId } from "mongodb";
import { open, seal, subkey } from "../crypto/aead";
import { collections } from "../db/collections";

// OAuth state: a random value the provider hands back, mapped to who started the sign-in.
// Stored hashed (a database read can't replay it), sealed PKCE verifier, ten minute TTL,
// and consumed atomically on first use, so a callback can't be replayed on any instance.

const TTL_MS = 10 * 60_000;
const PURPOSE = "oauth-pkce/v1";
const hash = (state: string) => createHash("sha256").update(state).digest("hex");

export interface PendingAuth {
  userId: ObjectId;
  type: string;
  verifier: string;
  returnTo: string;
  popup: boolean;
  shop?: string;
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function createState(p: Omit<PendingAuth, "verifier"> & { verifier: string }): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  const { oauthStates } = await collections();
  const now = new Date();
  await oauthStates.insertOne({
    _id: hash(state),
    userId: p.userId,
    type: p.type,
    verifierEnc: seal(subkey(PURPOSE), p.verifier, hash(state)),
    returnTo: p.returnTo,
    popup: p.popup,
    ...(p.shop ? { shop: p.shop } : {}),
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
  });
  return state;
}

export async function consumeState(state: string): Promise<PendingAuth | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  const { oauthStates } = await collections();
  const doc = await oauthStates.findOneAndDelete({ _id: hash(state), expiresAt: { $gt: new Date() } });
  if (!doc) return null;
  return { userId: doc.userId, type: doc.type, verifier: open(subkey(PURPOSE), doc.verifierEnc, hash(state)), returnTo: doc.returnTo, popup: doc.popup, shop: doc.shop };
}
