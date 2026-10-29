import Link from "next/link";
import { FlaskConical, KeyRound, Route } from "lucide-react";
import { allNodeDefinitions } from "@/lib/nodes/registry";
import { AsciiField } from "@/features/landing/ascii-field";
import { FAQ, TAGLINE } from "@/features/landing/content";
import { Faq } from "@/features/landing/faq";
import { HeroCard } from "@/features/landing/hero-card";
import { NavCta, SiteNav } from "@/components/site-nav";
import { Reveal } from "@/features/landing/reveal";
import { Benefits, Bricks, HowItWorks, PrimaryCta } from "@/features/landing/sections";
import { TaglineReveal } from "@/features/landing/tagline-reveal";
import { HandoffDemo } from "@/features/landing/handoff-demo";

const PROOF = [
  { label: "Free on devnet", Icon: FlaskConical, color: "var(--brick-1)" },
  { label: "Keys stay in your wallet", Icon: KeyRound, color: "var(--brick-5)" },
  { label: "Routing by MultiHopper", Icon: Route, color: "var(--brick-2)" },
];
const LANDING_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#bricks", label: "Bricks" },
  { href: "#faq", label: "FAQ" },
];

export default function Landing() {
  const brickCount = allNodeDefinitions().filter((d) => !d.unavailable).length;
  return (
    <div className="snap-root theme-white flex flex-1 flex-col">
      <a href="#main" className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <SiteNav links={LANDING_LINKS} right={<NavCta href="/workflows">Open builder</NavCta>} />

      <main id="main">
        <section className="snap-section relative items-center overflow-hidden" aria-labelledby="hero-title">
          <AsciiField />
          <div className="relative mx-auto flex w-full max-w-[1080px] flex-col items-center px-6 pb-16 pt-28 text-center [@media(max-height:860px)]:pb-10 [@media(max-height:860px)]:pt-24">
            <h1 id="hero-title" className="hero-heading max-w-[760px] font-display text-5xl font-semibold leading-[0.96] tracking-[-0.04em] sm:text-7xl lg:text-[84px] lg:[@media(max-height:860px)]:text-7xl">
              Build how your
              <br />
              money moves.
            </h1>
            <p className="mt-6 text-xl leading-[1.55] text-ink-2">
              Payout workflows for Solana teams.
              <br />
              Every transfer signed in your own wallet.
            </p>
            <div className="mt-10 w-full [@media(max-height:860px)]:mt-8">
              <div className="flex justify-center">
                <HeroCard brickCount={brickCount} />
              </div>
            </div>
            <PrimaryCta className="mt-10 [@media(max-height:860px)]:mt-8" />
            <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 rounded-full bg-white/85 px-5 py-2 text-base text-ink-2 backdrop-blur-sm [@media(max-height:860px)]:mt-4" aria-label="What you get">
              {PROOF.map(({ label, Icon, color }) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color }} strokeWidth={2} aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="dashed-x mx-auto w-full max-w-[1200px]">
          <section aria-label="Who decides" className="snap-section dashed-t px-6 pb-12 pt-24 [@media(max-height:860px)]:pb-4 [@media(max-height:860px)]:pt-20">
            <TaglineReveal lines={TAGLINE} center />
            <Reveal className="mx-auto mt-12 w-full max-w-[920px] [@media(max-height:860px)]:mt-8">
              <HandoffDemo />
            </Reveal>
          </section>

          <Benefits />
          <HowItWorks />
          <Bricks />

          <section id="faq" aria-labelledby="faq-title" className="snap-section dashed-t px-6 pb-12 pt-24 [@media(max-height:860px)]:pb-4 [@media(max-height:860px)]:pt-20">
            <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.5fr]">
              <Reveal className="lg:sticky lg:top-32">
                <h2 id="faq-title" className="font-display text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink text-balance sm:text-5xl sm:[@media(max-height:860px)]:text-4xl">
                  Questions people ask before they connect a wallet
                </h2>
                <p className="mt-4 text-lg leading-[1.6] text-ink-2 text-pretty">Short answers. If yours isn&apos;t here, ask before you send funds.</p>
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
                  <h2 id="final-title" className="hero-heading max-w-[680px] font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-balance sm:text-6xl">
                    Start with the payout template.
                  </h2>
                  <p className="mt-4 max-w-[560px] text-lg leading-[1.6] text-ink-2 text-pretty">
                    It already has the webhook, split, approval and signing steps wired. Add your recipients and a signing secret, then run it on devnet.
                  </p>
                  <PrimaryCta className="mt-8" />
                  <p className="mt-4 text-base text-ink-3">Free on devnet. No card, no custody.</p>
                </div>
              </Reveal>
            </div>
          <footer className="dashed-t flex flex-wrap items-center justify-between gap-6 px-6 py-8 text-base text-ink-3">
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
