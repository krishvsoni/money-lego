import { cancelRun } from "@/server/engine/runs";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const POST = route<undefined, true, { id: string }>({ auth: true, rate: RATE_RULES.write }, async ({ user }, { id }) => ({ run: await cancelRun(user, id) }));
