import { ArrowUpRight, Plus } from "@phosphor-icons/react/dist/ssr";

const CHIPS = [
  { label: "Signed webhook", color: "var(--brick-2)" },
  { label: "Split 60/40", color: "var(--brick-5)" },
  { label: "Approve", color: "var(--brick-4)" },
  { label: "Sign", color: "var(--brick-1)" },
];

// The frosted card in the middle of the hero: a workflow written as one line, the way the
// builder reads it. It blurs the route field behind it.
export function HeroCard({ brickCount }: { brickCount: number }) {
  return (
    <div className="w-full max-w-[800px] rounded-3xl border border-line bg-white/70 p-3 text-left shadow-[0_16px_48px_-24px_rgb(9_9_11/0.25)] backdrop-blur-md">
      <div className="rounded-lg px-4 pb-8 pt-4 [@media(max-height:860px)]:pb-5 [@media(max-height:860px)]:pt-3">
        <p className="text-lg text-ink-3 sm:text-xl">When a partner requests a payout</p>
        <ol className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Example workflow">
          {CHIPS.map((c, i) => (
            <li key={c.label} className="flex items-center gap-3">
              <span className="tactile inline-flex items-center gap-3 rounded-full px-4 py-2 text-base font-medium text-ink sm:text-lg">
                <span className="h-3 w-4 rounded-[3px]" style={{ background: c.color }} aria-hidden />
                {c.label}
              </span>
              {i < CHIPS.length - 1 && <span className="hidden h-px w-4 bg-line-strong sm:block" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between px-4 pb-2">
        <span className="flex items-center gap-2 text-base text-ink-3">
          <Plus size={18} aria-hidden />
          add a brick
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden font-mono text-sm text-ink-3 sm:inline">/ search {brickCount} bricks</span>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunken text-ink-2" aria-hidden>
            <ArrowUpRight size={18} />
          </span>
        </span>
      </div>
    </div>
  );
}
