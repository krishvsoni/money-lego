import { z } from "zod";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { createWorkflow, listWorkflows } from "@/server/workflows/service";
import { listSharedWorkflows, sharedCounts, sharedPeople } from "@/server/workflows/sharing";

// ?scope=shared lists what others shared with you; otherwise your own, by ?status.
// sharedCounts says how many people each of your workflows is shared with.
export const GET = route({ auth: true }, async ({ req, user }) => {
  const query = req.nextUrl.searchParams;
  if (query.get("scope") === "shared") return { workflows: await listSharedWorkflows(user), sharedCounts: {}, sharedWith: {} };
  const workflows = await listWorkflows(user, query.get("status") === "archived" ? "archived" : "active");
  const ids = workflows.map((w) => w.id);
  const [counts, people] = await Promise.all([sharedCounts(ids), sharedPeople(ids)]);
  return { workflows, sharedCounts: counts, sharedWith: people };
});

const common = { name: z.string().trim().max(80).optional(), requestKey: z.string().uuid().optional() };
const body = z.union([z.object({ templateId: z.literal("blank"), ...common }), z.object({ templateSlug: z.string().regex(/^[a-z0-9-]{3,60}$/), ...common })]);

export const POST = route({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }) => ({
  workflow: await createWorkflow(user, body),
}));
