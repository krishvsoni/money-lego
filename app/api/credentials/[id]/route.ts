import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { deleteCredential } from "@/server/workflows/credentials";

export const DELETE = route<undefined, true, { id: string }>({ auth: true, rate: RATE_RULES.write }, async ({ user }, { id }) => {
  await deleteCredential(user, id);
  return { ok: true };
});
