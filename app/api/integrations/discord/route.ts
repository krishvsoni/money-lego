import { NextResponse } from "next/server";
import { receiveDiscord } from "@/server/engine/inbound/platform";
import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const POST = route({ auth: false, rate: RATE_RULES.webhook }, async ({ req }) => {
  const result = await receiveDiscord(await readBody(req, 256 * 1024), req.headers);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
});
