import { currentUser } from "@/server/auth/session";
import { route } from "@/server/http/handler";

// Who the signed-in Clerk user is in Money Lego. Sign-in and sign-out are handled by Clerk.
export const GET = route({ auth: false }, async () => {
  const user = await currentUser();
  return { user: user ? { name: user.name } : null };
});
