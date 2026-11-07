import { captureShopOrder } from "@/server/commerce/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const POST = route<undefined, true, { orderId: string }>({ auth: true, rate: RATE_RULES.checkout }, async ({ user }, { orderId }) => captureShopOrder(user, orderId));
