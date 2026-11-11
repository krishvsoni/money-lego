import type { Metadata } from "next";
import { KindeRedirect } from "@/features/auth/kinde-redirect";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <KindeRedirect route="register" searchParams={searchParams} />;
}
