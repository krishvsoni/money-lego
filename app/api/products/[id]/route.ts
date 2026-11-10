import { getProduct } from "@/server/integrations/channel3";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

// One Channel3 product, live: photo, price, store, stock, rating and key features. The run
// panel uses it to show what a sourcing run actually bought. The API key stays server-side.
export const GET = route<undefined, true, { id: string }>({ auth: true, rate: RATE_RULES.read }, async (_ctx, { id }) => ({
  product: await getProduct(id),
}));
