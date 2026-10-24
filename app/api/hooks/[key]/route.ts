import { NextResponse } from "next/server";
import { receiveTriggerWebhook } from "@/server/engine/webhook-trigger";
import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const POST = route<undefined, false, { key: string }>({ auth: false, rate: RATE_RULES.webhook }, async ({ req }, { key }) => {
  const raw = await readBody(req, 64 * 1024);
  const result = await receiveTriggerWebhook(key, raw, req.headers);
  return NextResponse.json(result, { status: result.duplicate ? 200 : 202, headers: { "cache-control": "no-store" } });
});
