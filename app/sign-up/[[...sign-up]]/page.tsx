import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { FallbackAuthForm } from "@/features/auth/fallback-form";
import { clerkEnabled } from "@/lib/auth-provider";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 py-10">
      {clerkEnabled && (
        <Suspense>
          <SignUp />
        </Suspense>
      )}
      <FallbackAuthForm mode="sign-up" />
    </div>
  );
}
