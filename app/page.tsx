import Link from "next/link";
import { allNodeDefinitions } from "@/lib/nodes/registry";
import { AsciiField } from "@/features/landing/ascii-field";
import { FAQ, TAGLINE } from "@/features/landing/content";
import { Faq } from "@/features/landing/faq";
import { HeroCard } from "@/features/landing/hero-card";
import { IslandNav } from "@/features/landing/island-nav";
import { Reveal } from "@/features/landing/reveal";
import { SectionPager } from "@/features/landing/section-pager";
import { Benefits, Bricks, HowItWorks, PrimaryCta } from "@/features/landing/sections";
import { TaglineReveal } from "@/features/landing/tagline-reveal";
import { AutomationVisual, Tile, WalletVisual } from "@/features/landing/tiles";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

const PROOF = ["Free on devnet", "Keys stay in your wallet", "Routing by MultiHopper"];

export default function Landing() {
  const brickCount = allNodeDefinitions().filter((d) => !d.unavailable).length;
  return (
    <div className="snap-root theme-white flex flex-1 flex-col">
      <a href="#main" className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <IslandNav />
      <SectionPager />

      <main id="main">
        <section className="snap-section relative items-center overflow-hidden" aria-labelledby="hero-title">
          <AsciiField />
          <div className="relative mx-auto flex w-full max-w-[1080px] flex-col items-center px-6 pb-16 pt-28 text-center">
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

        <div className="dashed-x mx-auto w-full max-w-[1200px]">
          <section aria-label="Who decides" className="snap-section dashed-t px-6 pb-12 pt-24 [@media(max-height:860px)]:pb-4 [@media(max-height:860px)]:pt-20">
            <TaglineReveal lines={TAGLINE} center />
            <div className="relative mx-auto mt-12 w-full max-w-[880px]">
              <ul className="grid gap-4 md:grid-cols-2">
                <Tile visual={<AutomationVisual />} title="What automation does" body="Starts on a signed event, splits to the base unit and fetches the live quote. Then it stops and waits." badge="Runs on its own" />
                <Tile visual={<WalletVisual />} title="What only you can do" body="Review the exact amounts and sign. No schedule, webhook or server can take this step for you." badge="Only you" delay={120} />
              </ul>
              <span className="tactile pointer-events-none absolute left-1/2 top-[88px] z-10 hidden -translate-x-1/2 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-ink-2 md:flex" aria-hidden>
                hands off to
                <ArrowRight size={12} weight="bold" />
              </span>
            </div>
          </section>

          <Benefits />
          <HowItWorks />
          <Bricks />

          <section id="faq" aria-labelledby="faq-title" className="snap-section dashed-t px-6 pb-12 pt-24 [@media(max-height:860px)]:pb-4 [@media(max-height:860px)]:pt-20">
            <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.5fr]">
              <Reveal className="lg:sticky lg:top-32">
                <h2 id="faq-title" className="text-2xl font-medium tracking-tight text-ink text-balance sm:text-3xl">
                  Questions people ask before they connect a wallet
                </h2>
                <p className="mt-3 text-base text-ink-2 text-pretty">Short answers. If yours isn&apos;t here, ask before you send funds.</p>
              </Reveal>
              <Reveal delay={80}>
                <Faq items={FAQ} />
              </Reveal>
            </div>
          </section>

          <section aria-labelledby="final-title" className="snap-section dashed-t">
            <div className="flex flex-1 items-center px-6 pt-24">
              <Reveal className="tactile mx-auto flex w-full max-w-[800px] flex-col items-center rounded-2xl p-2 text-center">
                <div className="tactile-soft flex w-full flex-col items-center rounded-lg px-6 py-16">
                  <h2 id="final-title" className="hero-heading max-w-[680px] text-4xl font-light tracking-tight text-balance sm:text-5xl">
                    Start with the payout template.
                  </h2>
                  <p className="mt-4 max-w-[520px] text-base text-ink-2 text-pretty">
                    It already has the webhook, split, approval and signing steps wired. Add your recipients and a signing secret, then run it on devnet.
                  </p>
                  <PrimaryCta className="mt-8" />
                  <p className="mt-4 text-sm text-ink-3">Free on devnet. No card, no custody.</p>
                </div>
              </Reveal>
            </div>
          <footer className="dashed-t flex flex-wrap items-center justify-between gap-6 px-6 py-8 text-sm text-ink-3">
            <p>© 2026 Money Lego. Routing by MultiHopper on Solana.</p>
            <nav aria-label="Footer" className="flex flex-wrap gap-6">
              <Link href="/workflows" className="hover:text-ink">Builder</Link>
              <a href="https://dev-docs.multihopper.com/" target="_blank" rel="noreferrer" className="hover:text-ink">MultiHopper docs</a>
              <Link href="/privacy" className="hover:text-ink">Privacy</Link>
              <Link href="/terms" className="hover:text-ink">Terms</Link>
            </nav>
          </footer>
          </section>
        </div>
      </main>
    </div>
  );
}
