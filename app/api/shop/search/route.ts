import { z } from "zod";
import { assistantSearch } from "@/server/commerce/service";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";

const body = z.object({ request: z.string().trim().min(3).max(300), maxPrice: z.number().positive().max(100_000).nullable().optional() });

export const POST = route({ auth: true, rate: RATE_RULES.agent, body }, async ({ user, body }) => assistantSearch(user, body.request, body.maxPrice ?? null));
