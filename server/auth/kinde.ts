import "server-only";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import type { KindeIdentity } from "./link-identity";

// Kinde is the sign-in provider. Its SDK reads these variables itself; without all four the
// app runs with the email + password fallback only.
export function kindeConfigured(): boolean {
  return Boolean(process.env.KINDE_CLIENT_ID && process.env.KINDE_CLIENT_SECRET && process.env.KINDE_ISSUER_URL && process.env.KINDE_SITE_URL);
}

// The signed-in Kinde user, from Kinde's httpOnly session cookies. getUser() and getIdToken()
// validate the tokens and return null when they are missing, invalid or expired. We avoid
// isAuthenticated(): on an expired token it throws a redirect, which would turn an API call
// into a 500 instead of a 401. The proxy refreshes tokens before they expire.
export async function kindeIdentity(): Promise<KindeIdentity | null> {
  if (!kindeConfigured()) return null;
  const session = getKindeServerSession();
  const user = await session.getUser();
  if (!user) return null;
  const idToken = await session.getIdToken();
  const name = [user.given_name, user.family_name].filter(Boolean).join(" ").trim();
  return {
    id: user.id,
    email: user.email ? user.email.trim().toLowerCase() : null,
    emailVerified: idToken?.email_verified === true,
    name: (name || user.email || "Money Lego user").slice(0, 80),
  };
}
