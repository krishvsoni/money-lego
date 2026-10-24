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
    <div className="w-full max-w-[640px] rounded-2xl border border-line bg-white/70 p-2 text-left shadow-[0_16px_48px_-24px_rgb(9_9_11/0.25)] backdrop-blur-md">
      <div className="rounded-lg px-3 pb-6 pt-3">
        <p className="text-sm text-ink-3">When a partner requests a payout</p>
        <ol className="mt-3 flex flex-wrap items-center gap-2" aria-label="Example workflow">
          {CHIPS.map((c, i) => (
            <li key={c.label} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm text-ink">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: c.color }} aria-hidden />
                {c.label}
              </span>
              {i < CHIPS.length - 1 && <span className="hidden h-px w-3 bg-line-strong sm:block" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between px-3 pb-2">
        <span className="flex items-center gap-2 text-sm text-ink-3">
          <Plus size={16} aria-hidden />
          add a brick
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-ink-3 sm:inline">/ search {brickCount} bricks</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-ink-2" aria-hidden>
            <ArrowUpRight size={16} />
          </span>
        </span>
      </div>
    </div>
  );
}
