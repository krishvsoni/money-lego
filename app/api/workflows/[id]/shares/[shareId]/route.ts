import { z } from "zod";
import { shareRoleSchema } from "@/lib/workflow/sharing";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { revokeShare, setShareRole } from "@/server/workflows/sharing";

type Params = { id: string; shareId: string };

// The owner removes a share by its id; a viewer or editor leaves with the id "me".
export const DELETE = route<undefined, true, Params>({ auth: true, rate: RATE_RULES.write }, async ({ user }, { id, shareId }) => revokeShare(user, id, shareId));

const body = z.object({ role: shareRoleSchema });

// The owner switches someone between viewing and editing.
export const PATCH = route<typeof body, true, Params>({ auth: true, rate: RATE_RULES.share, body }, async ({ user, body }, { id, shareId }) => setShareRole(user, id, shareId, body.role));
