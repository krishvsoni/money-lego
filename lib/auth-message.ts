// The sign-in message, built identically on client and server. The server rebuilds it from
// the stored nonce record and checks the wallet signed exactly these bytes, so a client
// cannot swap the domain, wallet or expiry after the nonce was issued.

export interface SignInPayload {
  domain: string;
  wallet: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export function buildSignInMessage(p: SignInPayload): string {
  return [
    `${p.domain} wants you to sign in with your Solana account:`,
    p.wallet,
    "",
    "Sign in to Money Lego. This proves you own this wallet. It does not move funds or cost a fee.",
    "",
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
    `Expiration Time: ${p.expiresAt}`,
  ].join("\n");
}
