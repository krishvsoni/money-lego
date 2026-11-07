import { searchRuns } from "@/server/integrations/elastic";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

// Full-text search over your run history: Elastic when configured, MongoDB otherwise.
export const GET = route({ auth: true, rate: RATE_RULES.read }, async ({ user, req }) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const status = req.nextUrl.searchParams.get("status");
  return searchRuns(user.userId, q, { status: status && /^(succeeded|failed|waiting|cancelled)$/.test(status) ? status : undefined });
});
