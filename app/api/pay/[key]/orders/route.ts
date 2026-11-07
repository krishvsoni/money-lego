import { z } from "zod";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { createCheckoutOrder } from "@/server/paypal/inbound";

type Params = { key: string };
const body = z.object({ requestKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/) });

// Public: creates the PayPal order server-side at the workflow's own price. The browser
// never chooses the amount.
export const POST = route<typeof body, false, Params>({ auth: false, rate: RATE_RULES.checkout, body }, async ({ body }, { key }) => createCheckoutOrder(key, body.requestKey));
