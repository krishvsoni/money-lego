"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import { SessionProvider } from "@/features/auth/session-context";
import { ToastProvider } from "./toast";

// Wallets are discovered through the Wallet Standard, so any installed Solana wallet
// (Phantom, Solflare, Backpack…) appears without bundling per-wallet adapters.

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (configured) return configured;
    return clusterApiUrl(process.env.NEXT_PUBLIC_SOLANA_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet");
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={[]} autoConnect>
        <ToastProvider>
          <SessionProvider>{children}</SessionProvider>
        </ToastProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
