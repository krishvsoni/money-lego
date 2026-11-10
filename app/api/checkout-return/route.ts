import { collections } from "@/server/db/collections";
import { route } from "@/server/http/handler";

// PayPal sends a buyer back to /pay/done with the order id as `token`. For the signed-in owner
// of that order, this says which workflow and run created it, so the page can link straight
// back to the run. Anyone else (a buyer, a signed-out visitor) gets nothing.
export const GET = route({ auth: true }, async ({ req, user }) => {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!/^[A-Z0-9]{8,32}$/.test(token)) return { workflowId: null, runId: null };
  const { paypalResources } = await collections();
  const order = await paypalResources.findOne({ kind: "order", paypalId: token, ownerId: user.userId }, { projection: { workflowId: 1, runId: 1 } });
  return { workflowId: order?.workflowId?.toHexString() ?? null, runId: order?.runId?.toHexString() ?? null };
});
