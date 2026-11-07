import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { captureCheckoutOrder } from "@/server/paypal/inbound";

type Params = { key: string; orderId: string };

// Public: captures an order the buyer approved in PayPal's window. Only orders created by
// this checkout can be captured here.
export const POST = route<undefined, false, Params>({ auth: false, rate: RATE_RULES.checkout }, async (_ctx, { key, orderId }) => captureCheckoutOrder(key, orderId));
