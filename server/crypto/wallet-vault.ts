import "server-only";
import { createHmac } from "node:crypto";
import { open, seal, subkey } from "./aead";

// Wallet addresses are stored encrypted, never in plaintext. Equality lookups (sign-in,
// nonce matching) go through a blind index: a keyed HMAC, so the same wallet always maps
// to the same index, but without the server key a database dump can't be matched back to
// wallets by hashing a list of known addresses.

export type WalletField = "users.wallet" | "sessions.wallet" | "executions.sourceWallet";

const SEAL_PURPOSE = "wallet-seal/v1";
const INDEX_PURPOSE = "wallet-index/v1";

export function walletIndex(wallet: string): string {
  return createHmac("sha256", subkey(INDEX_PURPOSE)).update(wallet, "utf8").digest("hex");
}

export function sealWallet(wallet: string, field: WalletField): string {
  return seal(subkey(SEAL_PURPOSE), wallet, field);
}

export function openWallet(sealed: string, field: WalletField): string {
  return open(subkey(SEAL_PURPOSE), sealed, field);
}

// Short display form for places that only need to say who, like an approval record.
export function maskWallet(wallet: string): string {
  return wallet.length > 8 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}
