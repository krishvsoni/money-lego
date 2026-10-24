import { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { ExecutionDTO, PreparedBundleDTO } from "@/lib/dto";

// Drives MultiHopper's documented broadcast sequence from the browser:
//   1. keeper funding: sign, send, record, wait for confirmation, confirm with the API
//   2. route init → orchestrator init → session init → dispersion init, in that order,
//      each recorded as soon as it's sent and confirmed before the next goes out
//   3. final confirm, built server-side from the recorded signatures
// When a blockhash expires mid-way, we re-prepare: MultiHopper's resume data skips
// everything already on chain, so nothing is sent twice.

export type SignatureKind = "keeper_funding" | "route_init" | "orchestrator_init" | "session_init" | "dispersion_init";
type AnyTx = Transaction | VersionedTransaction;

export class SignerError extends Error {
  constructor(
    readonly reason: "rejected" | "onchain_failed" | "expired" | "gave_up" | "wallet_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "SignerError";
  }
}

export interface SignerDeps {
  prepare(): Promise<PreparedBundleDTO>;
  record(kind: SignatureKind, items: Array<{ signature: string; index: number }>): Promise<void>;
  confirm(stage: "funding" | "final"): Promise<ExecutionDTO>;
  signOne(tx: AnyTx): Promise<AnyTx>;
  signMany(txs: AnyTx[]): Promise<AnyTx[]>;
  send(raw: Uint8Array): Promise<string>;
  waitConfirmed(signature: string, blockhash: string, lastValidBlockHeight: number | null): Promise<void>;
  sleep(ms: number): Promise<void>;
  progress(message: string): void;
}

const MAX_ROUNDS = 3;
const SETTLE_MS = 3_000;

function decode(b64: string, legacy: boolean): AnyTx {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return legacy ? Transaction.from(bytes) : VersionedTransaction.deserialize(bytes);
}

function blockhashOf(tx: AnyTx): string {
  return tx instanceof VersionedTransaction ? tx.message.recentBlockhash : (tx.recentBlockhash ?? "");
}

function serialize(tx: AnyTx): Uint8Array {
  return tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize();
}

function isExpired(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /blockhash not found|block height exceeded|expired/i.test(text);
}

function isRejected(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /reject|denied|declined|cancel/i.test(text);
}

async function withRetry<T>(deps: SignerDeps, attempt: () => Promise<T>, retryable: (e: unknown) => boolean, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (i >= tries - 1 || !retryable(error)) throw error;
      await deps.sleep(2_000);
    }
  }
}

// MH_036: the API hasn't seen the transaction on chain yet. It's a timing gap, not a failure.
const notVisibleYet = (e: unknown) => e instanceof Error && /isn't visible on chain yet/i.test(e.message);

interface Step {
  kind: SignatureKind;
  index: number;
  tx: AnyTx;
  settle: boolean;
}

function setupSteps(bundle: PreparedBundleDTO): Step[] {
  const steps: Step[] = [];
  bundle.routeInitTxs.forEach((b, i) =>
    steps.push({ kind: "route_init", index: i, tx: decode(b, false), settle: i === bundle.routeInitTxs.length - 1 }),
  );
  if (bundle.orchestratorInitTx) steps.push({ kind: "orchestrator_init", index: 0, tx: decode(bundle.orchestratorInitTx, true), settle: true });
  bundle.sessionInitTxs.forEach((b, i) => steps.push({ kind: "session_init", index: i, tx: decode(b, false), settle: false }));
  bundle.dispersionInitTxs.forEach((b, i) => steps.push({ kind: "dispersion_init", index: i, tx: decode(b, false), settle: false }));
  return steps;
}

async function sendAndRecord(deps: SignerDeps, step: Step, signed: AnyTx, lastValidBlockHeight: number | null) {
  const signature = await deps.send(serialize(signed));
  await deps.record(step.kind, [{ signature, index: step.index }]);
  await deps.waitConfirmed(signature, blockhashOf(signed), lastValidBlockHeight);
}

export async function runSigner(deps: SignerDeps): Promise<ExecutionDTO> {
  for (let round = 0; round < MAX_ROUNDS; round++) {
    deps.progress(round === 0 ? "Preparing transactions" : "Refreshing transactions that timed out");
    const bundle = await deps.prepare();
    if (bundle.nothingToDo) return deps.confirm("final");

    try {
      if (bundle.keeperFundingTx) {
        deps.progress("Approve the funding transaction in your wallet");
        const keeper = decode(bundle.keeperFundingTx, false);
        const signed = await deps.signOne(keeper);
        deps.progress("Sending funding and waiting for confirmation");
        await sendAndRecord(deps, { kind: "keeper_funding", index: 0, tx: keeper, settle: false }, signed, bundle.lastValidBlockHeight);
        await withRetry(deps, () => deps.confirm("funding"), notVisibleYet);
      }

      const steps = setupSteps(bundle);
      if (steps.length) {
        deps.progress(`Approve ${steps.length} route setup transaction${steps.length > 1 ? "s" : ""} in your wallet`);
        const signed = await deps.signMany(steps.map((s) => s.tx));
        for (let i = 0; i < steps.length; i++) {
          deps.progress(`Setting up the route (${i + 1} of ${steps.length})`);
          await sendAndRecord(deps, steps[i], signed[i], bundle.lastValidBlockHeight);
          if (steps[i].settle) await deps.sleep(SETTLE_MS);
        }
      }

      deps.progress("Confirming with MultiHopper");
      const run = await withRetry(deps, () => deps.confirm("final"), notVisibleYet);
      if (run.state === "processing" || run.state === "completed") return run;
      // MultiHopper only starts the route once every account exists on chain; otherwise the
      // status stays put. Re-preparing returns whatever is still missing, or nothing to do.
      await deps.sleep(SETTLE_MS);
    } catch (error) {
      if (isRejected(error)) throw new SignerError("rejected", "You declined in your wallet. Anything already sent is saved; continue when you're ready.");
      if (isExpired(error)) continue;
      if (error instanceof Error && /bound on chain yet/i.test(error.message)) continue;
      throw error;
    }
  }
  throw new SignerError("gave_up", "Setup didn't finish after several tries. Recheck the status before continuing.");
}
