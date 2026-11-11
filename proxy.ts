import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

const clerk = clerkMiddleware();

export function shouldBypassClerkProxy(
  publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "production" && (publishableKey?.startsWith("pk_test_") ?? false);
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (shouldBypassClerkProxy()) return NextResponse.next();
  return clerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
