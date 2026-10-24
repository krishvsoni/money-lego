import Link from "next/link";
import { BrickGlyph } from "@/components/wordmark";

export default function NotFound() {
  return (
    <main id="main" className="theme-white flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <BrickGlyph className="h-6 w-10" />
      <h1 className="hero-heading mt-8 text-5xl font-light tracking-tight">This brick isn&apos;t here.</h1>
      <p className="mt-4 max-w-[480px] text-lg text-ink-2 text-pretty">The page may have moved, or the link was mistyped.</p>
      <div className="mt-10 flex gap-4">
        <Link href="/" className="press rounded-full bg-ink px-6 py-3 text-base font-semibold text-white hover:bg-[#27272a]">
          Go to the home page
        </Link>
        <Link href="/workflows" className="press rounded-full border border-line px-6 py-3 text-base font-semibold text-ink hover:bg-sunken">
          Open the builder
        </Link>
      </div>
    </main>
  );
}
