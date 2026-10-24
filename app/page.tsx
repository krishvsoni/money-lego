import { NetworkBadge } from "@/components/network-badge";
import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { brickColor } from "@/features/recipes/allocation-bar";
import { NodeIcon } from "@/features/workflows/node-icon";

const CHAIN = [
  { title: "Signed webhook", note: "A payout is requested", icon: "Webhook", color: "var(--brick-2)" },
  { title: "Split allocation", note: "Exact amounts per wallet", icon: "Split", color: "var(--brick-5)" },
  { title: "Human approval", note: "You say yes or no", icon: "UserCheck", color: "var(--brick-4)" },
  { title: "Sign & broadcast", note: "Your wallet, your keys", icon: "PenLine", color: "var(--brick-1)" },
  { title: "Discord message", note: "The team hears it landed", icon: "MessageSquare", color: "var(--brick-3)" },
];

const STEPS = [
  { title: "Snap the bricks together", body: "Drag triggers, logic, MultiHopper steps and notifications onto a canvas and connect them. Every step validates as you build." },
  { title: "Price it with a live quote", body: "MultiHopper nodes return the real fee, the SOL you need up front and what each recipient receives. Nothing is guessed." },
  { title: "Approve and sign yourself", body: "Runs pause at approval and wallet steps until you act. Automation prepares the payout; it never signs for you." },
  { title: "Track every run", body: "Each step's input, output, timing and errors are recorded, and runs resume on their own after waits and restarts." },
];

const LIMITS = [
  { title: "No custody", body: "Funds go from your wallet into MultiHopper's route. We never hold keys, balances or seed phrases." },
  { title: "No autopay", body: "A workflow is not permission to move money. Schedules and webhooks can start a run; only your wallet can fund it." },
  { title: "No privacy promises", body: "Routing spreads a payout across hops. It doesn't erase public chain history, and we won't claim it does." },
];

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-3">
          <NetworkBadge />
          <ButtonLink href="/workflows" variant="secondary">
            Open app
          </ButtonLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 sm:px-6">
        <section className="pb-20 pt-14 sm:pt-24">
          <h1 className="headline max-w-[15ch] text-display">Build how your money moves, brick by brick.</h1>
          <p className="mt-6 max-w-[58ch] text-lg text-ink-2">
            Money Lego is a visual workflow builder for Solana payouts. Connect triggers, checks, approvals and MultiHopper routing on a
            canvas. Runs are durable and every transfer still waits for your wallet.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/workflows">Open the builder</ButtonLink>
            <ButtonLink href="#how" variant="quiet">
              How a run works
            </ButtonLink>
          </div>

          <figure className="mt-16 overflow-x-auto rounded-xl border border-line bg-surface p-6 pt-9">
            <ol className="flex min-w-[860px] items-center">
              {CHAIN.map((b, i) => (
                <li key={b.title} className="flex flex-1 items-center">
                  <div className="brick-snap relative w-full" style={{ ["--i" as string]: i }}>
                    <span className="absolute -top-[6px] left-5 h-[7px] w-6 rounded-t-[3px]" style={{ background: b.color }} aria-hidden />
                    <span className="absolute -top-[6px] left-14 h-[7px] w-6 rounded-t-[3px]" style={{ background: b.color }} aria-hidden />
                    <div className="overflow-hidden rounded-[10px] border border-line-strong bg-paper shadow-[inset_0_-2px_0_rgb(0_0_0/0.06)]">
                      <div className="h-[6px]" style={{ background: b.color }} />
                      <div className="flex items-start gap-2.5 p-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${b.color} 16%, transparent)`, color: b.color }}>
                          <NodeIcon name={b.icon} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[0.8125rem] font-bold leading-tight">{b.title}</span>
                          <span className="block text-xs text-ink-3">{b.note}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  {i < CHAIN.length - 1 && <span className="h-[2px] w-6 shrink-0 bg-ink-3" aria-hidden />}
                </li>
              ))}
            </ol>
            <figcaption className="mt-5 text-sm text-ink-2">The example template: a signed request becomes an approved, wallet-signed, announced payout.</figcaption>
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
        Routing by MultiHopper on Solana. Built for teams that move money the same way more than once.
      </footer>
    </div>
  );
}
