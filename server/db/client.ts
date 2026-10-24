import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "../config/env";
import { log } from "../log";
import { runMigrations } from "./migrate";

// One connection pool per process. Every app instance is stateless and shares nothing but
// this database, which is what lets the app scale horizontally behind a load balancer.
//
// Consistency defaults: writes wait for a majority of replica-set members (a write we
// acknowledge survives a primary failover), and reads see only majority-committed data, so
// no instance ever acts on a write that could later be rolled back.

interface Cache {
  client: MongoClient | null;
  ready: Promise<Db> | null;
}

const globalCache = globalThis as unknown as { __mongo?: Cache };
const cache: Cache = globalCache.__mongo ?? { client: null, ready: null };
globalCache.__mongo = cache;

function createClient(): MongoClient {
  const e = env();
  return new MongoClient(e.MONGODB_URI, {
    appName: "money-lego",
    // Optional fields are omitted rather than stored as null, so documents round-trip
    // through the zod schemas unchanged.
    ignoreUndefined: true,
    maxPoolSize: 20,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    retryWrites: true,
    retryReads: true,
    writeConcern: { w: "majority", wtimeoutMS: 5_000 },
    readConcern: { level: "majority" },
    readPreference: "primary",
  });
}

export function mongoClient(): MongoClient {
  cache.client ??= createClient();
  return cache.client;
}

export function getDb(): Promise<Db> {
  cache.ready ??= (async () => {
    const client = mongoClient();
    await client.connect();
    const db = client.db(env().MONGODB_DB);
    await runMigrations(db);
    return db;
  })().catch((error) => {
    cache.ready = null;
    log.error("db.connect_failed", { error });
    throw error;
  });
  return cache.ready;
}
