"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/auth-provider";
import { signOutLocal, useLocalSession } from "./use-local-session";

const QUIET = "press inline-flex h-9 min-w-[84px] items-center justify-center whitespace-nowrap rounded-full border border-line bg-white px-4 text-[14px] font-medium text-ink hover:bg-sunken";
const SOLID = "press inline-flex h-9 min-w-[84px] items-center justify-center whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-white shadow-[0_1px_2px_rgb(9_9_11/0.2)] hover:bg-[#27272a]";

// Signed in: the account menu (plus a builder link on marketing pages). Signed out: a quiet
// "Sign in" and a solid "Sign up". With Clerk they open its modal; without it, our own pages.
export function AccountControl({ builderLink = false }: { builderLink?: boolean }) {
  return clerkEnabled ? <ClerkAccount builderLink={builderLink} /> : <LocalAccount builderLink={builderLink} />;
}

function ClerkAccount({ builderLink }: { builderLink: boolean }) {
  const { isLoaded, isSignedIn } = useAuth();
  const local = useLocalSession();
  if (!isLoaded) return <Placeholder />;
  if (isSignedIn) {
    // Clerk's avatar at the same 36px as the other buttons.
    return (
      <Signed builderLink={builderLink}>
        <UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} />
      </Signed>
    );
  }
  if (local.name) return <LocalSigned name={local.name} builderLink={builderLink} />;
  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal" withSignUp fallbackRedirectUrl="/workflows" signUpFallbackRedirectUrl="/workflows">
        <button type="button" className={QUIET}>
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal" fallbackRedirectUrl="/workflows" signInFallbackRedirectUrl="/workflows">
        <button type="button" className={SOLID}>
          Sign up
        </button>
      </SignUpButton>
    </div>
  );
}

function LocalAccount({ builderLink }: { builderLink: boolean }) {
  const local = useLocalSession();
  if (!local.loaded) return <Placeholder />;
  if (local.name) return <LocalSigned name={local.name} builderLink={builderLink} />;
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

function LocalSigned({ name, builderLink }: { name: string; builderLink: boolean }) {
  return (
    <Signed builderLink={builderLink}>
      <span className="max-w-32 truncate text-sm text-ink-2" title={name}>
        {name}
      </span>
      <button type="button" className="press text-sm text-ink-2 hover:text-ink" onClick={() => void signOutLocal()}>
        Sign out
      </button>
    </Signed>
  );
}

function Signed({ builderLink, children }: { builderLink: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {builderLink && (
        <Link href="/workflows" className="press inline-flex h-9 items-center whitespace-nowrap rounded-full bg-ink px-4 text-[14px] font-medium text-white hover:bg-[#27272a]">
          Open builder
        </Link>
      )}
      {children}
    </div>
  );
}

const Placeholder = () => <span className="h-9 w-[176px] animate-pulse rounded-full bg-sunken" aria-hidden />;
