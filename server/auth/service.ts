import "server-only";
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { buildSignInMessage, type SignInPayload } from "@/lib/auth-message";
import { isSolanaAddress } from "@/lib/solana-address";
import { env } from "../config/env";
import { collections } from "../db/collections";
import { errors } from "../errors";
import { createSession } from "./session";

const NONCE_TTL_MS = 5 * 60_000;

function appDomain(): string {
  return new URL(env().APP_URL).host;
}

export async function issueNonce(wallet: string): Promise<SignInPayload> {
  if (!isSolanaAddress(wallet)) throw errors.validation("That isn't a valid Solana wallet address.");
  const now = new Date();
  const doc = {
    _id: randomBytes(16).toString("hex"),
    wallet,
    domain: appDomain(),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + NONCE_TTL_MS),
    consumedAt: null,
  };
  const { nonces } = await collections();
  await nonces.insertOne(doc);
  return {
    domain: doc.domain,
    wallet,
    nonce: doc._id,
    issuedAt: doc.issuedAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
  };
}

function signatureMatches(message: string, signature: string, wallet: string): boolean {
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signature), bs58.decode(wallet));
  } catch {
    return false;
  }
}

export async function verifySignIn(input: { wallet: string; nonce: string; signature: string }) {
  const { nonces, users } = await collections();
  const now = new Date();

  // Consuming before verifying is deliberate: the nonce is single-use whether or not the
  // signature checks out, so a captured nonce can't be replayed or brute-forced.
  const nonce = await nonces.findOneAndUpdate(
    { _id: input.nonce, wallet: input.wallet, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
    { returnDocument: "before" },
  );
  if (!nonce) throw errors.validation("This sign-in request expired. Connect your wallet and try again.");

  const message = buildSignInMessage({
    domain: nonce.domain,
    wallet: nonce.wallet,
    nonce: nonce._id,
    issuedAt: nonce.issuedAt.toISOString(),
    expiresAt: nonce.expiresAt.toISOString(),
  });
  if (!signatureMatches(message, input.signature, nonce.wallet)) {
    throw errors.validation("The wallet signature didn't match. Try signing in again.");
  }

  const user = await users.findOneAndUpdate(
    { wallet: nonce.wallet },
    { $set: { lastSignedInAt: now }, $setOnInsert: { wallet: nonce.wallet, createdAt: now } },
    { upsert: true, returnDocument: "after" },
  );
  if (!user) throw errors.internal();
  await createSession(user._id, user.wallet);
  return { wallet: user.wallet };
}
