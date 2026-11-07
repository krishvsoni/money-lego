import { NextResponse } from "next/server";
import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { receivePaypalWebhook } from "@/server/paypal/inbound";

// PayPal webhook endpoint. Every delivery is verified with PayPal's signature API before
// anything is stored or run; duplicates are acknowledged without acting twice.
export const POST = route({ auth: false, rate: RATE_RULES.webhook }, async ({ req }) => {
  const result = await receivePaypalWebhook(await readBody(req, 256 * 1024), req.headers);
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
});
