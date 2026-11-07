"use client";

import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

// Signed in: Clerk's user menu. Signed out: one Sign in button; Clerk's modal links to sign-up.
export function AccountControl() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span className="h-9 w-24 animate-pulse rounded-full bg-sunken" aria-hidden />;
  if (isSignedIn) return <UserButton />;
  return (
    <SignInButton mode="modal">
      <Button className="h-9 rounded-full px-5">Sign in</Button>
    </SignInButton>
  );
}
