import type { Connection } from "@solana/web3.js";
import { SignerError } from "./signer";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Polls through the RPC proxy instead of a websocket subscription, which would need a
// direct connection to the upstream RPC from the browser.
export async function waitForSignature(connection: Connection, signature: string, lastValidBlockHeight: number | null): Promise<void> {
  const deadline = lastValidBlockHeight ?? (await connection.getLatestBlockhash("confirmed")).lastValidBlockHeight;
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) throw new SignerError("onchain_failed", "A transaction failed on chain. Nothing after it was sent. Recheck the status, then continue.");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    if ((await connection.getBlockHeight("confirmed")) > deadline) throw new Error("Transaction expired: block height exceeded");
    await sleep(1_500);
  }
}
