import { currentUser, signOutLocal } from "@/server/auth/session";
import { route } from "@/server/http/handler";

// Who is signed in, for the browser. Only a name and how they signed in: no ids, no tokens.
export const GET = route({ auth: false }, async () => {
  const user = await currentUser();
  return { user: user ? { name: user.name, kind: user.kind } : null };
});

// Ends an email + password session. A Kinde session ends at /api/auth/logout.
export const DELETE = route({ auth: false }, async () => {
  await signOutLocal();
  return { ok: true };
});
