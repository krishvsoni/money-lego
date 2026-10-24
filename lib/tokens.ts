// The vetted asset allowlist. Users pick from this list; they never type a mint. Adding a
// token here is a deliberate decision that MultiHopper supports it on that deployment.

export type SolanaNetwork = "devnet" | "mainnet-beta";

export interface TokenInfo {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
}

const TOKENS: Record<SolanaNetwork, TokenInfo[]> = {
  devnet: [
    { mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", symbol: "USDC", name: "USD Coin (devnet)", decimals: 6 },
  ],
  "mainnet-beta": [
    { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 },
  ],
};

export function currentNetwork(): SolanaNetwork {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

export function supportedTokens(network: SolanaNetwork = currentNetwork()): TokenInfo[] {
  return TOKENS[network];
}

export function findToken(mint: string, network: SolanaNetwork = currentNetwork()): TokenInfo | undefined {
  return TOKENS[network].find((t) => t.mint === mint);
}

export function explorerUrl(kind: "tx" | "address", value: string, network: SolanaNetwork = currentNetwork()): string {
  const cluster = network === "devnet" ? "?cluster=devnet" : "";
  return `https://explorer.solana.com/${kind}/${value}${cluster}`;
}
