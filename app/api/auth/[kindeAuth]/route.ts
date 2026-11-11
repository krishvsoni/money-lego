import { NextResponse, type NextRequest } from "next/server";
import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { isSafeRedirectPath } from "@/lib/auth/redirect";
import { kindeConfigured } from "@/server/auth/kinde";

// Kinde's sign-in routes: /api/auth/login, /register, /logout and /kinde_callback. Only these
// are served. Kinde's "setup" route returns the raw access and ID tokens as JSON to the browser;
// we never use its client SDK, so it stays off and tokens remain in httpOnly cookies.
const ALLOWED = new Set(["login", "register", "logout", "kinde_callback"]);

type Context = { params: Promise<{ kindeAuth: string }> };

const notFound = () => NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });

export async function GET(req: NextRequest, context: Context) {
  const { kindeAuth } = await context.params;
  if (!kindeConfigured() || !ALLOWED.has(kindeAuth)) return notFound();

  // Kinde sends people wherever this says after sign-in; only paths on this site are allowed.
  const next = req.nextUrl.searchParams.get("post_login_redirect_url");
  if (next !== null && !isSafeRedirectPath(next)) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Sign-in can only return to a page on this site." } }, { status: 400 });
  }

  // Created per request: handleAuth() throws at once if Kinde's variables are missing.
  return handleAuth()(req, context);
}
