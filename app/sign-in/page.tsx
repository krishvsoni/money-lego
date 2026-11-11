import type { Metadata } from "next";
import { KindeRedirect } from "@/features/auth/kinde-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <KindeRedirect route="login" searchParams={searchParams} />;
}
