"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SessionProvider } from "@/features/auth/session-context";
import { ToastProvider } from "./toast";

// Wallets are discovered through the Wallet Standard, so any installed Solana wallet
// (Phantom, Solflare, Backpack…) appears without bundling per-wallet adapters.
// RPC goes through our own /api/rpc so the upstream endpoint and its key never reach the
// browser. The placeholder only exists during server rendering, where nothing calls it.

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(
    () => (typeof window === "undefined" ? "http://localhost/api/rpc" : `${window.location.origin}/api/rpc`),
    [],
  );

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
