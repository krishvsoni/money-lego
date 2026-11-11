import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { kindeConfigured } from "@/server/auth/kinde";
import { FallbackAuthForm } from "./fallback-form";

// The sign-in and sign-up pages: Kinde first when it's set up, then the email + password
// fallback, so accounts of either kind can always get in.

const COPY = {
  "sign-in": { title: "Sign in to Money Lego", kinde: "Continue with Kinde", route: "login", other: { text: "New to Money Lego?", link: "Create an account", href: "/sign-up" } },
  "sign-up": { title: "Create your Money Lego account", kinde: "Sign up with Kinde", route: "register", other: { text: "Already have an account?", link: "Sign in", href: "/sign-in" } },
} as const;

export function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const copy = COPY[mode];
  const kinde = kindeConfigured();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="tactile w-full max-w-[420px] rounded-2xl p-6">
        <h1 className="headline text-2xl">{copy.title}</h1>
        <p className="mt-1 text-sm text-ink-2">PayPal Sandbox only: test accounts and test money.</p>

        {kinde && (
          <>
            {/* A plain link, not Kinde's LoginLink: that one turns the return path into an absolute
                URL, which our open-redirect check rejects. Kinde's route is a full-page redirect. */}
            <a
              href={`/api/auth/${copy.route}?post_login_redirect_url=${encodeURIComponent("/workflows")}`}
              className="press mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-ink text-sm font-semibold text-white hover:bg-[#27272a]"
            >
              {copy.kinde}
            </a>
            <div className="my-6 flex items-center gap-3 text-xs text-ink-3" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <div className={kinde ? "" : "mt-6"}>
          <FallbackAuthForm mode={mode} afterKinde={kinde} />
        </div>

        <p className="mt-6 text-center text-xs text-ink-2">
          {copy.other.text}{" "}
          <Link href={copy.other.href} className="font-medium text-ink underline underline-offset-2">
            {copy.other.link}
          </Link>
        </p>
      </div>
    </main>
  );
}
