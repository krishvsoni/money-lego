import { currentUser, destroySession } from "@/server/auth/session";
import { route } from "@/server/http/handler";

export const GET = route({ auth: false }, async () => {
  const user = await currentUser();
  return { user: user ? { wallet: user.wallet } : null };
});

export const DELETE = route({ auth: false }, async () => {
  await destroySession();
  return { ok: true };
});
