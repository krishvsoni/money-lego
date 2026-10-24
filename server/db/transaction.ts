import "server-only";
import type { ClientSession } from "mongodb";
import { mongoClient } from "./client";

// Multi-document ACID transaction on the replica set. The driver's withTransaction retries
// the whole callback on TransientTransactionError (e.g. a write conflict or a failover)
// and retries the commit on UnknownTransactionCommitResult, so callers must keep the
// callback free of side effects outside the database.

export async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = mongoClient().startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await work(session);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
        maxCommitTimeMS: 5_000,
      },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}
