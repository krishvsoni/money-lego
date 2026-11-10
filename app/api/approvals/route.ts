import { listPendingApprovals } from "@/server/engine/runs";
import { route } from "@/server/http/handler";

// Approvals waiting on the signed-in owner, across every workflow, for the app-wide inbox.
export const GET = route({ auth: true }, async ({ user }) => ({ approvals: await listPendingApprovals(user) }));
