import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { revokeShare } from "@/server/workflows/sharing";

// The owner removes a share by its id; a viewer leaves with the id "me".
export const DELETE = route<undefined, true, { id: string; shareId: string }>({ auth: true, rate: RATE_RULES.write }, async ({ user }, { id, shareId }) => revokeShare(user, id, shareId));
