import Link from "next/link";
import type { ReactNode } from "react";
import { BrickGlyph } from "@/components/wordmark";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="theme-white flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-[720px] px-6 pt-12">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <BrickGlyph className="h-3 w-5" />
          Money Lego
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-[720px] flex-1 px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-3">Last updated {updated}</p>
        <div className="mt-12 flex flex-col gap-6 text-base text-ink-2 text-pretty [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink">{children}</div>
        <Link href="/" className="mt-16 inline-block text-sm font-semibold text-ink underline underline-offset-4">
          Back to Money Lego
        </Link>
      </main>
    </div>
  );
}
