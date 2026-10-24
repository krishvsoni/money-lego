"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/toast";
import { api, errorMessage, newRequestKey } from "@/lib/api-client";
import type { ExecutionDTO } from "@/lib/dto";
import { isTerminal, STATE_META } from "@/lib/execution-states";
import { formatToken, relativeTime } from "@/lib/format";
import { QuoteReview } from "@/features/runs/quote-review";
import { HopProgress, RecipientOutcomes, SignatureList, Timeline } from "@/features/runs/run-progress";
import { useRun } from "@/features/runs/use-run";

const RESUMABLE = new Set(["signing", "funded", "submitted", "needs_check"]);

export function View() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { run, loadError, signing, progress, signError, refreshing, sign, recheck } = useRun(id);
  const [requoting, setRequoting] = useState(false);
  const requestKey = useRef<string | null>(null);

  if (loadError && !run) return <p role="alert" className="text-danger">{loadError}</p>;
  if (!run) return <div className="h-72 animate-pulse rounded-xl bg-sunken" />;

  const requote = async () => {
    setRequoting(true);
    requestKey.current ??= newRequestKey();
    try {
      const { run: next } = await api<{ run: ExecutionDTO }>("/api/runs", { body: { recipeId: run.recipeId, requestKey: requestKey.current } });
      router.push(`/runs/${next.id}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setRequoting(false);
    }
  };

  const copyReceipt = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/receipts/${run.shareToken}`).catch(() => null);
    toast("Receipt link copied. It shows amounts, wallets and signatures, never your labels.", "success");
  };

  const meta = STATE_META[run.state];
  const showReview = run.state === "quoted" && !signing;
  const showResume = RESUMABLE.has(run.state) && !signing;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/recipes/${run.recipeId}`} className="text-sm text-ink-2 hover:text-ink">
            {run.recipeName}
          </Link>
          <h1 className="headline mt-1 text-3xl">{formatToken(run.amountRaw, run.config.tokenMint)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <StatusBadge state={run.state} />
            <span>Started {relativeTime(run.createdAt)} from version {run.recipeVersion}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isTerminal(run.state) && run.state !== "quoted" && (
            <Button variant="secondary" onClick={recheck} busy={refreshing} disabled={signing}>
              Recheck status
            </Button>
          )}
          <Button variant="quiet" onClick={copyReceipt}>
            Copy receipt link
          </Button>
        </div>
      </header>

      {(run.state === "quoting" || run.state === "quote_unknown") && (
        <p className="rounded-xl bg-surface p-6 text-ink-2">{meta.help}</p>
      )}

      {showReview && <QuoteReview run={run} onSign={sign} signing={signing} onRequote={requote} />}

      {(signing || progress) && (
        <section className="reveal rounded-xl border border-action/40 bg-progress-wash p-6" aria-live="polite">
          <p className="font-bold text-action">{progress ?? "Working"}</p>
          <p className="mt-1 text-sm text-ink-2">Keep this tab open. Each transaction is saved as it&apos;s sent, so you can safely resume if something interrupts.</p>
        </section>
      )}

      {signError && !signing && (
        <section role="alert" className="reveal rounded-xl border border-danger/40 bg-danger-wash p-5">
          <p className="font-semibold text-danger">{signError}</p>
        </section>
      )}

      {showResume && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5">
          <div>
            <p className="font-bold">{meta.label}</p>
            <p className="text-sm text-ink-2">{meta.help}</p>
          </div>
          {run.state !== "submitted" && (
            <Button onClick={sign}>{run.signatures.length ? "Continue in wallet" : "Sign and send"}</Button>
          )}
        </section>
      )}

      {run.state === "expired" && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5">
          <p className="text-ink-2">{meta.help}</p>
          <Button onClick={requote} busy={requoting}>
            Get a new quote
          </Button>
        </section>
      )}

      {run.lastError && !isTerminal(run.state) && !signError && (
        <p className="text-sm text-attention">Last reported issue: {run.lastError.message}</p>
      )}

      {!showReview && run.state !== "quoting" && run.state !== "quote_unknown" && (
        <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
          <section className="flex flex-col gap-6">
            <HopProgress run={run} />
            <div>
              <h2 className="text-lg font-bold">Recipients</h2>
              <RecipientOutcomes run={run} />
            </div>
            {run.signatures.length > 0 && (
              <div>
                <h2 className="text-lg font-bold">Your transactions</h2>
                <div className="mt-3">
                  <SignatureList run={run} />
                </div>
              </div>
            )}
          </section>
          <aside>
            <h2 className="text-lg font-bold">History</h2>
            <div className="mt-4">
              <Timeline run={run} />
            </div>
            {(run.supportBundleId || run.providerStatus) && (
              <p className="mt-6 text-xs text-ink-3">
                {run.supportBundleId && <>MultiHopper reference {run.supportBundleId}. </>}
                {run.providerStatus && <>Raw status: {run.providerStatus}{run.providerPhase ? `, ${run.providerPhase}` : ""}.</>}
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
