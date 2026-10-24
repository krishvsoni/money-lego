import { listTransfers } from "@/server/executions/service";
import { route } from "@/server/http/handler";

// Transfers are created by MultiHopper nodes inside workflow runs; this lists them.
export const GET = route({ auth: true }, async ({ req, user }) => {
  const workflowId = req.nextUrl.searchParams.get("workflowId") ?? undefined;
  return { runs: await listTransfers(user, workflowId) };
});
