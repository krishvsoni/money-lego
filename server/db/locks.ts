import "server-only";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { isDuplicateKeyError } from "./collections";
import type { LockDoc } from "./types";

// A lease lock: whoever holds it may do the work until `expiresAt`. If the holder crashes
// the lease simply runs out, so a dead instance can never block the others forever. The
// unique _id makes acquisition atomic across every instance sharing the database.

export const INSTANCE_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

export async function acquireLease(locks: Collection<LockDoc>, name: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  try {
    const result = await locks.findOneAndUpdate(
      { _id: name, $or: [{ expiresAt: { $lte: now } }, { owner: INSTANCE_ID }] },
      { $set: { owner: INSTANCE_ID, expiresAt } },
      { upsert: true, returnDocument: "after" },
    );
    return result?.owner === INSTANCE_ID;
  } catch (error) {
    // Upsert raced with a live holder: the filter missed, the insert hit the unique _id.
    if (isDuplicateKeyError(error)) return false;
    throw error;
  }
}

export async function releaseLease(locks: Collection<LockDoc>, name: string): Promise<void> {
  await locks.deleteOne({ _id: name, owner: INSTANCE_ID });
}

export async function withLease<T>(
  locks: Collection<LockDoc>,
  name: string,
  ttlMs: number,
  work: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  if (!(await acquireLease(locks, name, ttlMs))) return { acquired: false };
  try {
    return { acquired: true, value: await work() };
  } finally {
    await releaseLease(locks, name);
  }
}
