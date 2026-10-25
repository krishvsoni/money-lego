import "server-only";
import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { buildSignInMessage, type SignInPayload } from "@/lib/auth-message";
import { isSolanaAddress } from "@/lib/solana-address";
import { env } from "../config/env";
import { collections } from "../db/collections";
import { sealWallet, walletIndex } from "../crypto/wallet-vault";
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
    walletHash: walletIndex(wallet),
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
  if (!isSolanaAddress(input.wallet)) throw errors.validation("That isn't a valid Solana wallet address.");
  const { nonces, users } = await collections();
  const now = new Date();
  const walletHash = walletIndex(input.wallet);

  // Consuming before verifying is deliberate: the nonce is single-use whether or not the
  // signature checks out, so a captured nonce can't be replayed or brute-forced. The nonce
  // matched on the wallet's index, so input.wallet is the wallet it was issued to.
  const nonce = await nonces.findOneAndUpdate(
    { _id: input.nonce, walletHash, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
    { returnDocument: "before" },
  );
  if (!nonce) throw errors.validation("This sign-in request expired. Connect your wallet and try again.");

  const message = buildSignInMessage({
    domain: nonce.domain,
    wallet: input.wallet,
    nonce: nonce._id,
    issuedAt: nonce.issuedAt.toISOString(),
    expiresAt: nonce.expiresAt.toISOString(),
  });
  if (!signatureMatches(message, input.signature, input.wallet)) {
    throw errors.validation("The wallet signature didn't match. Try signing in again.");
  }

  const user = await users.findOneAndUpdate(
    { walletHash },
    { $set: { lastSignedInAt: now }, $setOnInsert: { walletHash, walletEnc: sealWallet(input.wallet, "users.wallet"), createdAt: now } },
    { upsert: true, returnDocument: "after" },
  );
  if (!user) throw errors.internal();
  await createSession(user._id, input.wallet);
  return { wallet: input.wallet };
}
