import { getRunDetail } from "@/server/engine/runs";
import { route } from "@/server/http/handler";
import { enforceRateLimit, RATE_RULES } from "@/server/http/rate-limit";

export const GET = route<undefined, true, { id: string }>({ auth: true }, async ({ req, user }, { id }) => {
  const advance = req.nextUrl.searchParams.get("advance") === "1";
  if (advance) await enforceRateLimit(RATE_RULES.refresh, user.userId.toHexString());
  return { run: await getRunDetail(user, id, advance) };
});
