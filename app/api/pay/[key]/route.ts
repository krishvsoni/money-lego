import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { publicCheckout } from "@/server/paypal/inbound";

type Params = { key: string };

// Public: the product and price shown on a workflow's hosted checkout page.
export const GET = route<undefined, false, Params>({ auth: false, rate: RATE_RULES.read }, async (_ctx, { key }) => publicCheckout(key));
