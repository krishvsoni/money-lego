import { z } from "zod";
import { createShopOrder } from "@/server/commerce/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({ productId: z.string().regex(/^[A-Za-z0-9_-]{2,64}$/), requestKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/) });

// Creates the PayPal order at the price Channel3 reports right now, server-side.
export const POST = route({ auth: true, rate: RATE_RULES.checkout, body }, async ({ user, body }) => createShopOrder(user, body.productId, body.requestKey));
