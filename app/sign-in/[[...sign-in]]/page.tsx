import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense>
        <SignIn withSignUp fallbackRedirectUrl="/workflows" signUpFallbackRedirectUrl="/workflows" />
      </Suspense>
    </div>
  );
}
