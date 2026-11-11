"use client";

import Link from "next/link";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { signOutLocal, useAuthSession } from "./session-context";

const QUIET = "press inline-flex h-9 min-w-[84px] items-center justify-center whitespace-nowrap rounded-full border border-line bg-white px-4 text-[14px] font-medium text-ink hover:bg-sunken";
const SOLID = "press inline-flex h-9 min-w-[84px] items-center justify-center whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-white shadow-[0_1px_2px_rgb(9_9_11/0.2)] hover:bg-[#27272a]";

// Where Kinde sends someone back after signing in: the page they were on, except the
// marketing pages, which send them to their workflows.
function returnPath(pathname: string | null): string {
  if (!pathname || pathname === "/" || pathname.startsWith("/sign-") || pathname === "/privacy" || pathname === "/terms") return "/workflows";
  return pathname;
}

// Kinde's own routes. Plain <a>, never prefetched: they are full-page redirects to Kinde.
export const kindeHref = (route: "login" | "register", next = "/workflows") => `/api/auth/${route}?post_login_redirect_url=${encodeURIComponent(next)}`;

// The current path is read on click, not while rendering: usePathname() suspends while a
// dynamic route prerenders, and this control sits outside any Suspense boundary.
function goToKinde(route: "login" | "register") {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    window.location.assign(kindeHref(route, returnPath(window.location.pathname)));
  };
}

// Signed in: the person's name and Sign out (plus a builder link on marketing pages).
// Signed out: a quiet "Sign in" and a solid "Sign up", each going straight to Kinde.
export function AccountControl({ builderLink = false }: { builderLink?: boolean }) {
  const { loaded, user } = useAuthSession();
  if (!loaded) return <span className="h-9 w-[176px] animate-pulse rounded-full bg-sunken" aria-hidden />;

  if (user) {
    return (
      <div className="flex items-center gap-3">
        {builderLink && (
          <Link href="/workflows" className="press inline-flex h-9 items-center whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-[#27272a]">
            Open builder
          </Link>
        )}
        <span className="flex items-center gap-2" title={user.name}>
          <span aria-hidden className="tactile-soft flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold uppercase text-ink-2">
            {user.name.charAt(0)}
          </span>
          <span className="hidden max-w-32 truncate text-sm text-ink-2 sm:inline">{user.name}</span>
        </span>
        {user.kind === "kinde" ? (
          // A plain <a> to /api/auth/logout, never prefetched: Kinde's sign-out is a full-page redirect.
          <LogoutLink className="press text-sm text-ink-2 hover:text-ink">Sign out</LogoutLink>
        ) : (
          <button type="button" onClick={() => void signOutLocal()} className="press text-sm text-ink-2 hover:text-ink">
            Sign out
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <a href={kindeHref("login")} onClick={goToKinde("login")} className={QUIET}>
        Sign in
      </a>
      <a href={kindeHref("register")} onClick={goToKinde("register")} className={SOLID}>
        Sign up
      </a>
    </div>
  );
}
