import Link from "next/link";
import type { ReactNode } from "react";
import { NavCta, SiteNav } from "@/components/site-nav";

export const MARKETING_LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#bricks", label: "Bricks" },
  { href: "/#faq", label: "FAQ" },
];

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="theme-white flex flex-1 flex-col">
      <SiteNav links={MARKETING_LINKS} right={<NavCta href="/workflows">Open builder</NavCta>} />
      <main id="main" className="mx-auto w-full max-w-[720px] flex-1 px-6 pb-16 pt-32">
        <h1 className="font-display text-5xl font-semibold tracking-[-0.025em] text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-3">Last updated {updated}</p>
        <div className="mt-12 flex flex-col gap-6 text-lg leading-[1.6] text-ink-2 text-pretty [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink">{children}</div>
        <Link href="/" className="mt-16 inline-block text-sm font-semibold text-ink underline underline-offset-4">
          Back to Money Lego
        </Link>
      </main>
    </div>
  );
}
