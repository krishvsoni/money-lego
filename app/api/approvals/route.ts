import { listPendingApprovals } from "@/server/engine/runs";
import { route } from "@/server/http/handler";
import { listShareNotices } from "@/server/workflows/sharing";

// The signed-in person's notifications, for the bell and the corner notice: approvals waiting
// on them across every workflow, and workflows other people have shared with them.
export const GET = route({ auth: true }, async ({ user }) => {
  const [approvals, shares] = await Promise.all([listPendingApprovals(user), listShareNotices(user)]);
  return { approvals, shares };
});
