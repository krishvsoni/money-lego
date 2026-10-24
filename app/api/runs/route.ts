import { z } from "zod";
import { startRun, listRuns } from "@/server/executions/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

export const GET = route({ auth: true }, async ({ req, user }) => {
  const recipeId = req.nextUrl.searchParams.get("recipeId") ?? undefined;
  return { runs: await listRuns(user, recipeId) };
});

const body = z.object({
  recipeId: z.string().length(24),
  requestKey: z.string().regex(/^[A-Za-z0-9-]{16,64}$/),
});

export const POST = route({ auth: true, rate: RATE_RULES.quote, body }, async ({ user, body }) => ({
  run: await startRun(user, body.recipeId, body.requestKey),
}));
