import { NextResponse } from "next/server";
import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { handleTelegramUpdate } from "@/server/oauth/telegram";

export const POST = route({ auth: false, rate: RATE_RULES.webhook }, async ({ req }) => {
  await handleTelegramUpdate(await readBody(req, 64 * 1024), req.headers);
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
});
