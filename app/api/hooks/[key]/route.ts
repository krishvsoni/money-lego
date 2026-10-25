import { NextResponse } from "next/server";
import { receiveTriggerWebhook } from "@/server/engine/webhook-trigger";
import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const POST = route<undefined, false, { key: string }>({ auth: false, rate: RATE_RULES.webhook }, async ({ req }, { key }) => {
  // Shopify order payloads with many line items run past 64 KB; 256 KB covers them.
  const raw = await readBody(req, 256 * 1024);
  const result = await receiveTriggerWebhook(key, raw, req.headers);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
});
