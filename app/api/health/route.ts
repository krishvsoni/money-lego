import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";

// Liveness plus a database round-trip, for load balancers and uptime checks.
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    const hello = await db.admin().command({ hello: 1 });
    return NextResponse.json({
      ok: true,
      db: { ms: Date.now() - started, replicaSet: hello.setName ?? null, primary: Boolean(hello.isWritablePrimary) },
    });
  } catch {
    return NextResponse.json({ ok: false, db: null }, { status: 503 });
  }
}
