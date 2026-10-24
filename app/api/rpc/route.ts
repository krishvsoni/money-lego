import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { forwardRpc, rpcRequestSchema } from "@/server/rpc/proxy";

export const POST = route({ auth: true, rate: RATE_RULES.rpc, body: rpcRequestSchema }, async ({ body }) => forwardRpc(body));
