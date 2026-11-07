import { explainRun } from "@/server/ai/explain";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const POST = route<undefined, true, { id: string }>({ auth: true, rate: RATE_RULES.agent }, async ({ user }, { id }) => ({ explanation: await explainRun(user, id) }));
