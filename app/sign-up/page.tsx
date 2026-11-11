import type { Metadata } from "next";
import { AuthPage } from "@/features/auth/auth-page";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return <AuthPage mode="sign-up" />;
}
