import { z } from "zod";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { createWorkflow, listWorkflows } from "@/server/workflows/service";

export const GET = route({ auth: true }, async ({ req, user }) => ({
  workflows: await listWorkflows(user, req.nextUrl.searchParams.get("status") === "archived" ? "archived" : "active"),
}));

const body = z.object({ templateId: z.string().max(40), name: z.string().trim().max(80).optional() });

export const POST = route({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }) => ({
  workflow: await createWorkflow(user, body.templateId, body.name),
}));
