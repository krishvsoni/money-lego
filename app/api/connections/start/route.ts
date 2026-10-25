import { z } from "zod";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { startConnection } from "@/server/oauth/flow";

const body = z.object({
  slug: z.string().regex(/^[a-z-]{3,20}$/),
  returnTo: z.string().max(200).optional(),
  popup: z.boolean().optional(),
  shop: z.string().max(80).optional(),
});

// POST, not GET, so starting a sign-in goes through the same-origin check like any write.
export const POST = route({ auth: true, rate: RATE_RULES.write, body }, async ({ user, body }) => ({
  url: await startConnection(user, body.slug, { returnTo: body.returnTo ?? null, popup: Boolean(body.popup), shop: body.shop ?? null }),
}));
