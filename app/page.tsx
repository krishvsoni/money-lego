import { NetworkBadge } from "@/components/network-badge";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { AllocationBar, brickColor } from "@/features/recipes/allocation-bar";

const EXAMPLE = [
  { key: "design", title: "Design", amount: 1_600n },
  { key: "eng", title: "Engineering", amount: 1_400n },
  { key: "community", title: "Community", amount: 700n },
  { key: "ops", title: "Operations", amount: 500n },
];

const STEPS = [
  { title: "Build the recipe", body: "Pick the token, add up to 20 recipient wallets and their amounts. The totals are checked to the last base unit." },
  { title: "Review the real quote", body: "MultiHopper prices the run live. You see the fee, the SOL you need up front, and what each recipient receives." },
  { title: "Sign in your wallet", body: "Your wallet approves each transaction in the order MultiHopper requires. Money Lego never holds your keys." },
  { title: "Track every recipient", body: "Watch the route progress and see each payout land, with signatures you can open in an explorer." },
];

const LIMITS = [
  { title: "No custody", body: "Funds go from your wallet into MultiHopper's route. We never hold keys, balances or seed phrases." },
  { title: "No autopay", body: "A recipe is not permission to move money. Every run needs a fresh quote and your signature." },
  { title: "No privacy promises", body: "Routing spreads a payout across hops. It doesn't erase public chain history, and we won't claim it does." },
];

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-3">
          <NetworkBadge />
          <ButtonLink href="/dashboard" variant="secondary">
            Open app
          </ButtonLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 sm:px-6">
        <section className="pb-20 pt-14 sm:pt-24">
          <h1 className="headline max-w-[14ch] text-display">Set up a payout once. Run it every time you pay.</h1>
          <p className="mt-6 max-w-[58ch] text-lg text-ink-2">
            Money Lego saves who you pay and how much as a recipe. Each run gets a live MultiHopper quote, you approve it in your own
            wallet, and every recipient&apos;s payout is tracked down to its signature.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">Build your first recipe</ButtonLink>
            <ButtonLink href="#how" variant="quiet">
              How a run works
            </ButtonLink>
          </div>

          <figure className="mt-16 rounded-xl border border-line bg-surface p-5 pt-8 sm:p-8 sm:pt-10">
            <AllocationBar segments={EXAMPLE} size="lg" assemble label="Example payout split between four teams" />
            <figcaption className="mt-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
              <span className="text-sm font-semibold">Studio contributors, 4,200 USDC</span>
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-2">
                {EXAMPLE.map((s, i) => (
                  <li key={s.key} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: brickColor(i) }} aria-hidden />
                    {s.title} <span className="text-ink">{s.amount.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </figcaption>
          </figure>
        </section>

        <section id="how" className="scroll-mt-8 border-t border-line py-16">
          <h2 className="headline text-3xl">How a run works</h2>
          <ol className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                  style={{ background: brickColor(i) }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg font-bold">{s.title}</h3>
                  <p className="mt-1.5 max-w-[46ch] text-ink-2">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-16">
          <h2 className="headline text-3xl">What it won&apos;t do</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {LIMITS.map((l) => (
              <div key={l.title}>
                <h3 className="font-bold">{l.title}</h3>
                <p className="mt-1.5 text-sm text-ink-2">{l.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[1080px] px-4 py-8 text-sm text-ink-3 sm:px-6">
        Routing by MultiHopper on Solana. Built for teams that pay the same people more than once.
      </footer>
    </div>
  );
}
