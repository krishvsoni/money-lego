"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { api, errorMessage } from "@/lib/api-client";
import type { ExecutionDTO, PreparedBundleDTO } from "@/lib/dto";
import { isTerminal } from "@/lib/execution-states";
import { runSigner, SignerError } from "./signer";

const POLL_MS: Partial<Record<ExecutionDTO["state"], number>> = {
  quoting: 3_000,
  quote_unknown: 5_000,
  submitted: 8_000,
  processing: 10_000,
  needs_check: 8_000,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useRun(id: string) {
  const [run, setRun] = useState<ExecutionDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const signingRef = useRef(false);
  const { connection } = useConnection();
  const wallet = useWallet();

  const load = useCallback(
    async (refresh: boolean) => {
      try {
        const { run: next } = await api<{ run: ExecutionDTO }>(`/api/runs/${id}${refresh ? "?refresh=1" : ""}`);
        setRun(next);
        setLoadError(null);
        return next;
      } catch (e) {
        setLoadError(errorMessage(e));
        return null;
      }
    },
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    api<{ run: ExecutionDTO }>(`/api/runs/${id}`)
      .then(({ run: next }) => !cancelled && setRun(next))
      .catch((e) => !cancelled && setLoadError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Poll while the provider is doing work. Paused while the wallet flow runs, and while
  // the tab is hidden, so idle tabs don't spend the provider's rate limit.
  useEffect(() => {
    const interval = run && !signing ? POLL_MS[run.state] : undefined;
    if (!interval || (run && isTerminal(run.state))) return;
    const timer = setInterval(() => {
      if (!document.hidden && !signingRef.current) void load(true);
    }, interval);
    return () => clearInterval(timer);
  }, [run, signing, load]);

  const recheck = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const sign = useCallback(async () => {
    if (!run || signingRef.current) return;
    const { publicKey, signTransaction, signAllTransactions } = wallet;
    if (!publicKey || !signTransaction) {
      setSignError("Connect your wallet to sign.");
      return;
    }
    if (publicKey.toBase58() !== run.sourceWallet) {
      setSignError("Your wallet is on a different account than the one that created this run. Switch accounts in your wallet.");
      return;
    }
    signingRef.current = true;
    setSigning(true);
    setSignError(null);
    try {
      const result = await runSigner({
        prepare: async () => (await api<{ bundle: PreparedBundleDTO }>(`/api/runs/${id}/prepare`, { body: {} })).bundle,
        record: async (kind, items) => {
          const { run: next } = await api<{ run: ExecutionDTO }>(`/api/runs/${id}/signatures`, { body: { kind, items } });
          setRun(next);
        },
        confirm: async (stage) => {
          const { run: next } = await api<{ run: ExecutionDTO }>(`/api/runs/${id}/confirm`, { body: { stage } });
          setRun(next);
          return next;
        },
        signOne: (tx) => signTransaction(tx as Transaction & VersionedTransaction),
        signMany: async (txs) =>
          signAllTransactions
            ? signAllTransactions(txs as Array<Transaction & VersionedTransaction>)
            : Promise.all(txs.map((tx) => signTransaction(tx as Transaction & VersionedTransaction))),
        send: (raw) => connection.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 }),
        waitConfirmed: async (signature, blockhash, lastValidBlockHeight) => {
          const height = lastValidBlockHeight ?? (await connection.getLatestBlockhash("confirmed")).lastValidBlockHeight;
          const { value } = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight: height }, "confirmed");
          if (value.err) throw new SignerError("onchain_failed", "A transaction failed on chain. Nothing after it was sent. Recheck the status, then continue.");
        },
        sleep,
        progress: setProgress,
      });
      setRun(result);
      setProgress(null);
    } catch (e) {
      setSignError(errorMessage(e));
      setProgress(null);
      await load(false);
    } finally {
      signingRef.current = false;
      setSigning(false);
    }
  }, [run, wallet, id, connection, load]);

  return { run, loadError, signing, progress, signError, refreshing, sign, recheck };
}
