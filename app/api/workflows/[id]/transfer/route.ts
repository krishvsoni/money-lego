import { z } from "zod";
import { shareEmailSchema } from "@/lib/workflow/sharing";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { transferWorkflow } from "@/server/workflows/sharing";

const body = z.object({ email: shareEmailSchema });

// Makes the account with this address the owner. The caller keeps view access.
export const POST = route<typeof body, true, { id: string }>({ auth: true, rate: RATE_RULES.share, body }, async ({ user, body }, { id }) => transferWorkflow(user, id, body.email));
