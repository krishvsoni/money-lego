import { NextResponse, type NextRequest } from "next/server";
import { isSafeRedirectPath } from "@/lib/auth/redirect";
import { kindeConfigured } from "@/server/auth/kinde";

// /sign-in and /sign-up have no page of their own: they hand straight over to Kinde, which
// returns to `next` (a path on this site) or the workflows. Route handlers, not pages, so
// nothing about them is prerendered.
export function kindeRedirect(route: "login" | "register") {
  return (req: NextRequest) => {
    const raw = req.nextUrl.searchParams.get("next");
    const next = raw && isSafeRedirectPath(raw) ? raw : "/workflows";
    if (!kindeConfigured()) {
      return new NextResponse("Sign-in isn't set up yet. Add the KINDE_ settings to this server's environment and restart it.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    const target = new URL(`/api/auth/${route}`, req.nextUrl.origin);
    target.searchParams.set("post_login_redirect_url", next);
    return NextResponse.redirect(target, 307);
  };
}
