import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react"; 
import { FallbackAuthForm } from "@/features/auth/fallback-form";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 py-10">
      <Suspense>
        <SignUp />
      </Suspense>
      <FallbackAuthForm mode="sign-up" />
    </div>
  );
}
