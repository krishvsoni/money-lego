import { z } from "zod";
import { shareEmailSchema } from "@/lib/workflow/sharing";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { getSharing, shareWorkflow } from "@/server/workflows/sharing";

type Params = { id: string };

export const GET = route<undefined, true, Params>({ auth: true }, async ({ user }, { id }) => ({ sharing: await getSharing(user, id) }));

const body = z.object({ email: shareEmailSchema });

// Gives one address view access. Repeating it is harmless: `created` says whether it was new.
export const POST = route<typeof body, true, Params>({ auth: true, rate: RATE_RULES.share, body }, async ({ user, body }, { id }) => shareWorkflow(user, id, body.email));
