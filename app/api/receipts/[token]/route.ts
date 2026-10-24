import { getReceipt } from "@/server/executions/receipts";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const GET = route<undefined, false, { token: string }>({ auth: false, rate: RATE_RULES.refresh }, async (_ctx, { token }) => ({
  receipt: await getReceipt(token),
}));
