import { findOwnedExecution, toExecutionDTO } from "@/server/executions/repository";
import { refreshRun } from "@/server/executions/service";
import { route } from "@/server/http/handler";
import { enforceRateLimit, RATE_RULES } from "@/server/http/rate-limit";

export const GET = route<undefined, true, { id: string }>({ auth: true }, async ({ req, user }, { id }) => {
  if (req.nextUrl.searchParams.get("refresh") === "1") {
    await enforceRateLimit(RATE_RULES.refresh, user.userId.toHexString());
    return { run: await refreshRun(user, id) };
  }
  return { run: toExecutionDTO(await findOwnedExecution(user, id)) };
});
