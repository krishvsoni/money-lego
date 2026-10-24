import Link from "next/link";
import { ClockCounterClockwise, Copy, Equals, Receipt } from "@phosphor-icons/react/dist/ssr";
import { definitionsByCategory } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import { BENEFITS, STEPS } from "./content";
import { Reveal } from "./reveal";

const ICONS = { equals: Equals, clock: ClockCounterClockwise, copy: Copy, receipt: Receipt };

export function PrimaryCta({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/workflows"
      className={`press inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-base font-semibold text-white shadow-[0_8px_20px_-10px_rgb(9_9_11/0.6)] hover:bg-[#27272a] ${className}`}
    >
      Build your first workflow
    </Link>
  );
}

export function SectionHeading({ title, body }: { title: string; body?: string }) {
  return (
    <Reveal className="max-w-[680px]">
      <h2 className="text-3xl font-semibold tracking-tight text-ink text-balance sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-lg text-ink-2 text-pretty">{body}</p>}
    </Reveal>
  );
}

export function Benefits() {
  return (
    <section aria-labelledby="benefits" className="mx-auto max-w-[1080px] px-6 py-24">
      <h2 id="benefits" className="sr-only">Why teams use it</h2>
      <ul className="grid gap-12 sm:grid-cols-2">
        {BENEFITS.map((b, i) => {
          const Icon = ICONS[b.icon as keyof typeof ICONS];
          return (
            <Reveal as="li" key={b.title} delay={i * 80} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink">
                <Icon size={20} aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-ink">{b.title}</h3>
                <p className="mt-2 text-base text-ink-2 text-pretty">{b.body}</p>
              </div>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-24 border-t border-line">
      <div className="mx-auto max-w-[1080px] px-6 py-24">
        <h2 id="how-title" className="sr-only">How it works</h2>
        <SectionHeading title="Three steps from request to paid" body="The same flow for one payout or a hundred. Only the trigger changes." />
        <ol className="mt-16 grid gap-12 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i * 100}>
              <span className="text-sm font-medium text-ink-3">Step {i + 1}</span>
              <h3 className="mt-3 text-xl font-semibold text-ink">{s.title}</h3>
              <p className="mt-3 text-base text-ink-2 text-pretty">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

// Proof by product: the actual node catalog, read from the registry, honest about what
// isn't built yet.
export function Bricks() {
  const groups = definitionsByCategory();
  return (
    <section id="bricks" aria-labelledby="bricks-title" className="scroll-mt-24 border-t border-line">
      <div className="mx-auto max-w-[1080px] px-6 py-24">
        <h2 id="bricks-title" className="sr-only">Bricks</h2>
        <SectionHeading title="The bricks in the box today" body="Every brick below works in the builder now. The two marked soon are listed so you know they are coming, not because they run." />
        <div className="mt-16 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, i) => (
            <Reveal key={g.category} delay={i * 60}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="h-3 w-3 rounded-[3px]" style={{ background: CATEGORY_META[g.category].color }} aria-hidden />
                {CATEGORY_META[g.category].title}
              </h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {g.nodes.map((n) => (
                  <li key={n.type} className={`rounded-full border px-3 py-1 text-sm ${n.unavailable ? "border-dashed border-line-strong text-ink-3" : "border-line bg-white text-ink"}`}>
                    {n.title}
                    {n.unavailable && <span className="ml-2 text-xs">soon</span>}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
