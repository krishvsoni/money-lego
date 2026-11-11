"use client";

import Link from "next/link";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { signOutLocal, useAuthSession } from "./session-context";

const QUIET = "press inline-flex h-9 min-w-[84px] items-center justify-center whitespace-nowrap rounded-full border border-line bg-white px-4 text-[14px] font-medium text-ink hover:bg-sunken";
const SOLID = "press inline-flex h-9 min-w-[84px] items-center justify-center whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-white shadow-[0_1px_2px_rgb(9_9_11/0.2)] hover:bg-[#27272a]";

// Signed in: the person's name and Sign out (plus a builder link on marketing pages).
// Signed out: a quiet "Sign in" and a solid "Sign up". Both open our own pages, which offer
// Kinde first and the email + password fallback below it, so every account can sign in.
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
      <Link href="/sign-in" className={QUIET}>
        Sign in
      </Link>
      <Link href="/sign-up" className={SOLID}>
        Sign up
      </Link>
    </div>
  );
}
