import { describe, expect, it } from "vitest";
import { Keypair, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { ExecutionDTO, PreparedBundleDTO } from "@/lib/dto";
import { runSigner, SignerError, type SignerDeps } from "@/features/runs/signer";

const payer = Keypair.generate();
const blockhash = "11111111111111111111111111111111";
const ix = () => SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 });
const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const v0 = () => toB64(new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: [ix()] }).compileToV0Message()).serialize());
const legacy = () => {
  const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: blockhash }).add(ix());
  tx.sign(payer);
  return toB64(tx.serialize());
};

const bundle = (over: Partial<PreparedBundleDTO> = {}): PreparedBundleDTO => ({
  keeperFundingTx: v0(),
  routeInitTxs: [v0(), v0()],
  orchestratorInitTx: legacy(),
  sessionInitTxs: [v0()],
  dispersionInitTxs: [v0()],
  lastValidBlockHeight: 100,
  nothingToDo: false,
  ...over,
});

function harness(bundles: PreparedBundleDTO[], opts: { failSendAt?: number; finalState?: ExecutionDTO["state"]; reject?: boolean } = {}) {
  const log: string[] = [];
  let sends = 0;
  const deps: SignerDeps = {
    prepare: async () => {
      log.push("prepare");
      return bundles.shift() ?? bundle({ keeperFundingTx: null, routeInitTxs: [], orchestratorInitTx: null, sessionInitTxs: [], dispersionInitTxs: [], nothingToDo: true });
    },
    record: async (kind, items) => void log.push(`record:${kind}:${items[0].index}`),
    confirm: async (stage) => {
      log.push(`confirm:${stage}`);
      return { state: stage === "final" ? (opts.finalState ?? "processing") : "funded" } as ExecutionDTO;
    },
    signOne: async (tx) => {
      if (opts.reject) throw new Error("User rejected the request");
      return tx;
    },
    signMany: async (txs) => txs,
    send: async () => {
      sends++;
      if (sends === opts.failSendAt) throw new Error("Blockhash not found");
      return `sig${sends}`;
    },
    waitConfirmed: async () => void log.push("wait"),
    sleep: async () => {},
    progress: () => {},
  };
  return { deps, log };
}

describe("runSigner", () => {
  it("funds first, confirms funding, then broadcasts setup in documented order", async () => {
    const { deps, log } = harness([bundle()]);
    const run = await runSigner(deps);
    expect(run.state).toBe("processing");
    expect(log.filter((l) => !l.startsWith("wait"))).toEqual([
      "prepare",
      "record:keeper_funding:0",
      "confirm:funding",
      "record:route_init:0",
      "record:route_init:1",
      "record:orchestrator_init:0",
      "record:session_init:0",
      "record:dispersion_init:0",
      "confirm:final",
    ]);
  });

  it("records every signature before waiting on chain confirmation", async () => {
    const { deps, log } = harness([bundle()]);
    await runSigner(deps);
    log.forEach((entry, i) => {
      if (entry === "wait") expect(log[i - 1]).toMatch(/^record:/);
    });
  });

  it("re-prepares after a blockhash expires instead of resending", async () => {
    const resumed = bundle({ keeperFundingTx: null, routeInitTxs: [] });
    const { deps, log } = harness([bundle(), resumed], { failSendAt: 3 });
    await runSigner(deps);
    expect(log.filter((l) => l === "prepare")).toHaveLength(2);
    expect(log.filter((l) => l === "record:keeper_funding:0")).toHaveLength(1);
  });

  it("surfaces a wallet rejection without retrying", async () => {
    const { deps, log } = harness([bundle()], { reject: true });
    await expect(runSigner(deps)).rejects.toBeInstanceOf(SignerError);
    expect(log).toEqual(["prepare"]);
  });

  it("loops back to prepare when the provider hasn't started the route", async () => {
    const { deps, log } = harness([bundle()], { finalState: "submitted" });
    const run = await runSigner(deps);
    expect(log.filter((l) => l === "prepare")).toHaveLength(2);
    expect(run.state).toBe("submitted");
  });
});
