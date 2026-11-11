import { withAuth } from "@kinde-oss/kinde-auth-nextjs/middleware";
import { NextResponse, type NextRequest } from "next/server";

// Keeps Kinde sessions alive: Kinde's middleware swaps an expiring access token for a fresh one
// using the refresh-token cookie. It runs only for people who have that cookie.
//
// Every path is public to it on purpose. Kinde's middleware would otherwise send signed-out
// visitors to its login page; here pages gate on the client and APIs answer 401 themselves,
// exactly as before the move to Kinde.
const EVERY_PATH = /.*/;

export default async function proxy(req: NextRequest) {
  const hasKindeSession = req.cookies.has("refresh_token");
  if (!hasKindeSession || !process.env.KINDE_CLIENT_ID) return NextResponse.next();
  return withAuth(req, { publicPaths: [EVERY_PATH] });
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
