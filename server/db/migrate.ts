import "server-only";
import type { Db } from "mongodb";
import { log } from "../log";
import { COLLECTIONS } from "./names";
import { acquireLease, releaseLease } from "./locks";
import { migration001 } from "./migrations/001-schema";
import { migration002 } from "./migrations/002-workflows";
import { migration003 } from "./migrations/003-encrypt-wallets";
import type { LockDoc, MigrationDoc } from "./types";

// Versioned, forward-only migrations. Every instance calls this on boot; the lease makes
// sure exactly one runs them while the others wait, and the migrations collection records
// what's applied so a migration never runs twice.

const MIGRATIONS = [migration001, migration002, migration003];
const LOCK = "migrations";
const LOCK_TTL_MS = 60_000;

export async function runMigrations(db: Db): Promise<void> {
  const applied = db.collection<MigrationDoc>(COLLECTIONS.migrations);
  const pending = async () => {
    const done = new Set((await applied.find({}, { projection: { _id: 1 } }).toArray()).map((m) => m._id));
    return MIGRATIONS.filter((m) => !done.has(m.id));
  };

  if ((await pending()).length === 0) return;

  const locks = db.collection<LockDoc>(COLLECTIONS.locks);
  const deadline = Date.now() + LOCK_TTL_MS;
  while (!(await acquireLease(locks, LOCK, LOCK_TTL_MS))) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for another instance to finish migrations");
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    for (const migration of await pending()) {
      const started = Date.now();
      await migration.up(db);
      await applied.insertOne({ _id: migration.id, appliedAt: new Date() });
      log.info("db.migration_applied", { id: migration.id, ms: Date.now() - started });
    }
  } finally {
    await releaseLease(locks, LOCK);
  }
}
