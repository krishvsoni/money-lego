// Which sign-in system this deployment uses. Read by the proxy, the server session and the
// browser, so all three always agree: Clerk's server helpers throw when its middleware didn't
// run, and its hooks throw outside <ClerkProvider>, so half-enabled Clerk breaks every request.
//
// "local" (email + password, server/auth/session.ts) is used when asked for, or when there is
// no Clerk key at all. NEXT_PUBLIC_ values are fixed at build time: change it, then redeploy.

export type AuthProvider = "clerk" | "local";

export function authProviderFrom(requested: string | undefined, publishableKey: string | undefined): AuthProvider {
  return requested === "local" || !publishableKey ? "local" : "clerk";
}

// Spelled out in full so Next inlines both values into client and edge bundles.
export const AUTH_PROVIDER = authProviderFrom(process.env.NEXT_PUBLIC_AUTH_PROVIDER, process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
export const clerkEnabled = AUTH_PROVIDER === "clerk";
