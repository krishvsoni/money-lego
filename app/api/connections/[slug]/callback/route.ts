import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth/session";
import { appUrl } from "@/server/config/env";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { completeConnection } from "@/server/oauth/flow";

// The provider sends the browser here after consent. The result page gets only a status
// and a human message; the code and tokens stay on the server.
export const GET = route<undefined, false, { slug: string }>({ auth: false, rate: RATE_RULES.write }, async ({ req }, { slug }) => {
  const result = await completeConnection(await currentUser(), slug, req.nextUrl.searchParams);
  const done = new URL("/connections/done", appUrl());
  done.searchParams.set("status", result.ok ? "ok" : "error");
  done.searchParams.set("message", result.message);
  done.searchParams.set("returnTo", result.returnTo);
  if (result.type) done.searchParams.set("type", result.type);
  if (result.popup) done.searchParams.set("popup", "1");
  return NextResponse.redirect(done, { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
});
