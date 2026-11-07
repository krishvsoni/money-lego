import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { AccountControl } from "@/features/auth/account-control";
import { LogoMark } from "@/components/wordmark";
import { MARKETING_LINKS } from "@/features/landing/legal-page";

export default function NotFound() {
  return (
    <div className="theme-white flex flex-1 flex-col">
      <SiteNav links={MARKETING_LINKS} right={<AccountControl builderLink />} />
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-32 text-center">
        <LogoMark className="h-12 w-12" />
        <h1 className="hero-heading mt-8 font-display text-6xl font-semibold tracking-[-0.03em]">This brick isn&apos;t here.</h1>
        <p className="mt-4 max-w-[480px] text-xl leading-[1.55] text-ink-2 text-pretty">The page may have moved, or the link was mistyped.</p>
        <div className="mt-10 flex gap-4">
          <Link href="/" className="press rounded-full bg-ink px-7 py-3.5 text-lg font-medium text-white hover:bg-[#27272a]">
            Go to the home page
          </Link>
          <Link href="/workflows" className="press tactile rounded-full px-7 py-3.5 text-lg font-medium text-ink">
            Open the builder
          </Link>
        </div>
      </main>
    </div>
  );
}
