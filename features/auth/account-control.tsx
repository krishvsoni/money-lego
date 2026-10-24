"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Button } from "@/components/ui/button";
import { shortAddress } from "@/lib/solana-address";
import { useSession } from "./session-context";

// One control that walks the person through: pick a wallet, connect, sign in. Each state
// says exactly what the next click will do.

function WalletPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { wallets, select } = useWallet();
  const available = wallets.filter((w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(92vw,380px)] rounded-xl border border-line bg-surface p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="p-5">
        <h2 className="text-lg font-bold">Choose a wallet</h2>
        <p className="mt-1 text-sm text-ink-2">Money Lego never holds your keys. You approve every transaction in your wallet.</p>
        <ul className="mt-4 flex flex-col gap-2">
          {available.map((w) => (
            <li key={w.adapter.name}>
              <button
                className="press flex w-full items-center gap-3 rounded-md border border-line px-3 py-2.5 text-left text-sm font-semibold hover:border-ink-3"
                onClick={() => {
                  select(w.adapter.name);
                  onClose();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.adapter.icon} alt="" className="h-6 w-6 rounded" />
                {w.adapter.name}
              </button>
            </li>
          ))}
        </ul>
        {available.length === 0 && (
          <p className="mt-4 rounded-md bg-sunken p-3 text-sm text-ink-2">
            No Solana wallet found in this browser. Install{" "}
            <a className="font-semibold text-action underline" href="https://phantom.com" target="_blank" rel="noreferrer">
              Phantom
            </a>{" "}
            or{" "}
            <a className="font-semibold text-action underline" href="https://solflare.com" target="_blank" rel="noreferrer">
              Solflare
            </a>
            , then reload this page.
          </p>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function AccountControl({ compact = false }: { compact?: boolean }) {
  const { connected, connecting, publicKey, wallet } = useWallet();
  const session = useSession();
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);

  if (session.status === "loading") return <span className="h-10 w-32 animate-pulse rounded-md bg-sunken" aria-hidden />;

  if (session.status === "signed-in" && !session.mismatch) {
    return (
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          className="press tactile flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold"
        >
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
          <span className="font-mono text-[0.8125rem]">{shortAddress(session.wallet ?? "")}</span>
        </button>
        {menu && (
          <div className="reveal absolute right-0 top-12 z-30 w-56 origin-top-right rounded-lg border border-line bg-surface p-1.5 shadow-[0_12px_32px_-16px_rgb(23_32_51/0.4)]">
            <button
              className="press w-full rounded px-3 py-2 text-left text-sm hover:bg-sunken"
              onClick={() => {
                navigator.clipboard.writeText(session.wallet ?? "").catch(() => null);
                setMenu(false);
              }}
            >
              Copy wallet address
            </button>
            <button className="press w-full rounded px-3 py-2 text-left text-sm text-danger hover:bg-danger-wash" onClick={() => session.signOut()}>
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  const step = !connected ? "connect" : "sign";
  return (
    <div className="flex items-center gap-2">
      {session.mismatch && !compact && (
        <span className="hidden text-xs text-attention sm:inline">Wallet changed to {shortAddress(publicKey?.toBase58() ?? "")}</span>
      )}
      {step === "connect" ? (
        <Button className="h-9" onClick={() => setPicking(true)} busy={connecting}>
          {wallet && connecting ? `Connecting ${wallet.adapter.name}` : "Connect wallet"}
        </Button>
      ) : (
        <Button className="h-9" onClick={() => session.signIn()} busy={session.signingIn}>
          {session.mismatch ? "Sign in as this wallet" : "Sign in with wallet"}
        </Button>
      )}
      <WalletPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}
