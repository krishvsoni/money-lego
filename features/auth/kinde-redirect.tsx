import { redirect } from "next/navigation";
import { isSafeRedirectPath } from "@/lib/auth/redirect";
import { kindeConfigured } from "@/server/auth/kinde";

// /sign-in and /sign-up have no page of their own: they hand straight over to Kinde, which
// returns to `next` (a path on this site) or the workflows.
export async function KindeRedirect({ route, searchParams }: { route: "login" | "register"; searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === "string" && isSafeRedirectPath(raw) ? raw : "/workflows";
  if (kindeConfigured()) redirect(`/api/auth/${route}?post_login_redirect_url=${encodeURIComponent(next)}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4">
      <h1 className="headline text-2xl">Sign-in isn&apos;t set up yet</h1>
      <p className="mt-2 text-ink-2">Add the KINDE_ settings to this server&apos;s environment and restart it.</p>
    </main>
  );
}
