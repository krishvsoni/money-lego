import Link from "next/link";
import { allNodeDefinitions } from "@/lib/nodes/registry";
import { AsciiField } from "@/features/landing/ascii-field";
import { FAQ, TAGLINE } from "@/features/landing/content";
import { Faq } from "@/features/landing/faq";
import { HeroCard } from "@/features/landing/hero-card";
import { IslandNav } from "@/features/landing/island-nav";
import { Reveal } from "@/features/landing/reveal";
import { Benefits, Bricks, HowItWorks, PrimaryCta, SectionHeading } from "@/features/landing/sections";
import { TaglineReveal } from "@/features/landing/tagline-reveal";

const PROOF = ["Free on devnet", "Keys stay in your wallet", "Routing by MultiHopper"];

export default function Landing() {
  const brickCount = allNodeDefinitions().filter((d) => !d.unavailable).length;
  return (
    <div className="theme-white flex flex-1 flex-col">
      <a href="#main" className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <IslandNav />

      <main id="main">
        <section className="relative flex min-h-screen items-center overflow-hidden" aria-labelledby="hero-title">
          <AsciiField />
          <div className="relative mx-auto flex w-full max-w-[1080px] flex-col items-center px-6 pb-24 pt-32 text-center">
            <h1 id="hero-title" className="hero-heading max-w-[680px] text-5xl font-light tracking-tight sm:text-7xl">
              Build how your
              <br />
              money moves.
            </h1>
            <p className="mt-6 max-w-[680px] text-lg text-ink-2 text-pretty">
              Payout workflows for Solana teams. Connect signed webhooks, approvals and MultiHopper routing on one canvas, and sign
              every transfer from your own wallet.
            </p>
            <div className="mt-10 w-full">
              <div className="flex justify-center">
                <HeroCard brickCount={brickCount} />
              </div>
            </div>
            <PrimaryCta className="mt-10" />
            <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-2" aria-label="What you get">
              {PROOF.map((p, i) => (
                <li key={p} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: `var(--brick-${[1, 5, 2][i]})` }} aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-label="What Money Lego believes" className="mx-auto w-full max-w-[1080px] px-6 pb-12 pt-24 sm:pt-32">
          <TaglineReveal lines={TAGLINE} />
        </section>

        <Benefits />
        <HowItWorks />
        <Bricks />

        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24 border-t border-line bg-surface">
          <div className="mx-auto max-w-[1080px] px-6 py-24">
            <h2 id="faq-title" className="sr-only">Questions</h2>
            <SectionHeading title="Questions people ask before they connect a wallet" />
            <Reveal className="mt-12">
              <Faq items={FAQ} />
            </Reveal>
          </div>
        </section>

        <section aria-labelledby="final-title" className="border-t border-line">
          <div className="mx-auto flex max-w-[1080px] flex-col items-center px-6 py-24 text-center sm:py-32">
            <Reveal className="flex flex-col items-center">
              <h2 id="final-title" className="hero-heading max-w-[680px] text-4xl font-light tracking-tight text-balance sm:text-6xl">
                Start with the payout template.
              </h2>
              <p className="mt-6 max-w-[560px] text-lg text-ink-2 text-pretty">
                It already has the webhook, split, approval and signing steps wired. Add your recipients and a signing secret, then run it on devnet.
              </p>
              <PrimaryCta className="mt-10" />
              <p className="mt-4 text-sm text-ink-3">Free on devnet. No card, no custody.</p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-6 px-6 py-8 text-sm text-ink-2">
          <p>© 2026 Money Lego. Routing by MultiHopper on Solana.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-6">
            <Link href="/workflows" className="hover:text-ink">Builder</Link>
            <a href="https://dev-docs.multihopper.com/" target="_blank" rel="noreferrer" className="hover:text-ink">MultiHopper docs</a>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
