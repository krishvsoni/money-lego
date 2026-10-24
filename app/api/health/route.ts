import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/config/env";
import { getDb } from "@/server/db/client";

// Public callers (load balancers, uptime checks) only learn up or down. Topology details
// such as the replica set name are shown only to callers holding the operator secret.
function isOperator(req: NextRequest): boolean {
  const secret = env().CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const NO_STORE = { "cache-control": "private, no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const db = await getDb();
    const hello = await db.admin().command({ hello: 1 });
    const body = isOperator(req)
      ? { ok: true, db: { ms: Date.now() - started, replicaSet: hello.setName ?? null, primary: Boolean(hello.isWritablePrimary) } }
      : { ok: true };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
