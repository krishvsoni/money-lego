"use client";

import { useCallback, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { api, errorMessage } from "@/lib/api-client";
import type { ExecutionDTO, RecoveryBundleDTO } from "@/lib/dto";
import { waitForSignature } from "./chain";

export type RecoveryKind = RecoveryBundleDTO["kind"];

// MultiHopper may pre-sign recovery transactions with its own keys (partialSigners);
// VersionedTransaction keeps those signatures and parses legacy messages too.
function decode(b64: string): VersionedTransaction {
  return VersionedTransaction.deserialize(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

export function useRecovery(run: ExecutionDTO | null, onUpdated: (run: ExecutionDTO) => void) {
  const [busy, setBusy] = useState<RecoveryKind | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const { connection } = useConnection();
  const { publicKey, signAllTransactions, signTransaction } = useWallet();

  const recover = useCallback(
    async (kind: RecoveryKind) => {
      if (!run || busyRef.current) return;
      if (!publicKey || !signTransaction) return setError("Connect your wallet to continue.");
      if (publicKey.toBase58() !== run.sourceWallet) {
        return setError("Recovered SOL goes to the wallet that funded this run. Switch to that account in your wallet.");
      }
      busyRef.current = true;
      setBusy(kind);
      setError(null);
      try {
        setProgress("Asking MultiHopper for the recovery transactions");
        const { bundle } = await api<{ bundle: RecoveryBundleDTO }>(`/api/runs/${run.id}/recovery`, { body: { kind } });
        const txs = bundle.txs.map(decode);
        setProgress(`Approve ${txs.length} transaction${txs.length > 1 ? "s" : ""} in your wallet`);
        const signed = signAllTransactions ? await signAllTransactions(txs) : await Promise.all(txs.map((t) => signTransaction(t)));
        const signatures: string[] = [];
        for (let i = 0; i < signed.length; i++) {
          setProgress(`Sending ${i + 1} of ${signed.length}`);
          const signature = await connection.sendRawTransaction(signed[i].serialize(), { preflightCommitment: "confirmed", maxRetries: 5 });
          signatures.push(signature);
          await waitForSignature(connection, signature, bundle.lastValidBlockHeight);
        }
        setProgress("Confirming with MultiHopper");
        const { run: next } = await api<{ run: ExecutionDTO }>(`/api/runs/${run.id}/recovery/confirm`, { body: { kind, signatures } });
        onUpdated(next);
      } catch (e) {
        setError(/reject|denied|declined|cancel/i.test(String(e)) ? "You declined in your wallet. Nothing was sent." : errorMessage(e));
      } finally {
        busyRef.current = false;
        setBusy(null);
        setProgress(null);
      }
    },
    [run, publicKey, signAllTransactions, signTransaction, connection, onUpdated],
  );

  return { recover, busy, progress, error };
}
