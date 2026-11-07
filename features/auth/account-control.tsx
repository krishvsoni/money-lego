"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

// Signed in: Clerk's user menu (plus a builder link on marketing pages). Signed out: a quiet
// "Sign in" and a solid "Sign up", both opening Clerk's modal; either flow can also create
// an account, so a first-time Google sign-in never dead-ends.
export function AccountControl({ builderLink = false }: { builderLink?: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span className="h-9 w-40 animate-pulse rounded-full bg-sunken" aria-hidden />;

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2">
        {builderLink && (
          <Link href="/workflows" className="press inline-flex h-9 items-center whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-[#27272a]">
            Open builder
          </Link>
        )}
        <UserButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <SignInButton mode="modal" withSignUp fallbackRedirectUrl="/workflows" signUpFallbackRedirectUrl="/workflows">
        <button type="button" className="press inline-flex h-9 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal" fallbackRedirectUrl="/workflows" signInFallbackRedirectUrl="/workflows">
        <button type="button" className="press inline-flex h-9 items-center whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-white shadow-[0_1px_2px_rgb(9_9_11/0.2)] hover:bg-[#27272a]">
          Sign up
        </button>
      </SignUpButton>
    </div>
  );
}
