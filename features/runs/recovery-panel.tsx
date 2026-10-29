"use client";

import { Button } from "@/components/ui/button";
import type { ExecutionDTO } from "@/lib/dto";
import { formatSol } from "@/lib/format";
import { useRecovery } from "./use-recovery";

// Shown only when MultiHopper reports SOL that can come back to the funding wallet: a
// rescue after a failed or stuck route, or a rent refund once a route has completed.
export function RecoveryPanel({ run, onUpdated }: { run: ExecutionDTO; onUpdated: (run: ExecutionDTO) => void }) {
  const { recover, busy, progress, error } = useRecovery(run, onUpdated);
  const r = run.recovery;
  if (!r || (!r.canRescue && !r.canReclaimRent)) return null;

  const rescue = r.canRescue;
  const lamports = rescue ? r.rescuableLamports : r.reclaimableLamports;
  const tone = rescue ? "border-attention/40 bg-attention-wash" : "border-line bg-surface";

  return (
    <section className={`reveal flex flex-col gap-3 rounded-xl border p-5 ${tone}`} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-bold">{rescue ? `${formatSol(lamports)} is waiting to be rescued` : `${formatSol(lamports)} rent refund available`}</p>
          <p className="text-sm text-ink-2">
            {rescue
              ? "This route didn't finish. MultiHopper can return the SOL locked in its setup accounts to the wallet that funded it."
              : "The route is done. Closing its setup accounts returns their rent deposit to your wallet."}
          </p>
        </div>
        <Button onClick={() => recover(rescue ? "rescue" : "reclaim")} busy={busy !== null} variant={rescue ? "primary" : "secondary"}>
          {rescue ? "Rescue SOL" : "Claim refund"}
        </Button>
      </div>
      {progress && <p className="text-sm font-semibold text-progress">{progress}</p>}
      {error && !busy && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
