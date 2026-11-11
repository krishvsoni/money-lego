import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { FallbackAuthForm } from "@/features/auth/fallback-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 py-10">
      <Suspense>
        <SignIn withSignUp fallbackRedirectUrl="/workflows" signUpFallbackRedirectUrl="/workflows" />
      </Suspense>
      <FallbackAuthForm mode="sign-in" />
    </div>
  );
}
