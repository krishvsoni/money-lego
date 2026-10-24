import Link from "next/link";
import type { ReactNode } from "react";
import { BrickGallery } from "./brick-gallery";
import { BenefitGrid } from "./benefits";
import { STEPS } from "./content";
import { ApprovalVisual, CenterHeader, ChainVisual, SignaturesVisual, Tile } from "./tiles";

export function PrimaryCta({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/workflows"
      className={`press inline-flex items-center justify-center rounded-full bg-ink px-7 py-3.5 text-lg font-medium text-white shadow-[0_8px_20px_-10px_rgb(9_9_11/0.6)] hover:bg-[#27272a] ${className}`}
    >
      Build your first workflow
    </Link>
  );
}

const STEP_VISUALS = [<ChainVisual key="c" />, <ApprovalVisual key="a" />, <SignaturesVisual key="s" />];

// Sections below the hero share one frame: dashed rails at the sides, a dashed rule on
// top, a centred header, then tiles.
export function FramedSection({ id, title, body, children, className = "" }: { id: string; title: string; body?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`snap-section dashed-t px-6 pb-12 pt-24 [@media(max-height:860px)]:pb-4 [@media(max-height:860px)]:pt-20 ${className}`}>
      <CenterHeader id={`${id}-title`} title={title} body={body} />
      <div className="mt-8 [@media(max-height:860px)]:mt-6">{children}</div>
    </section>
  );
}

export function Benefits() {
  return (
    <FramedSection id="why" title="Built so the numbers can be trusted" body="Four guarantees the builder keeps on every run, whoever or whatever starts it.">
      <BenefitGrid />
    </FramedSection>
  );
}

export function HowItWorks() {
  return (
    <FramedSection id="how" title="Three steps from request to paid" body="The same flow for one payout or a hundred. Only the trigger changes.">
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Tile key={s.title} visual={STEP_VISUALS[i]} title={s.title} body={s.body} badge={`Step ${i + 1}`} delay={i * 100} />
        ))}
      </ol>
    </FramedSection>
  );
}

export function Bricks() {
  return (
    <FramedSection id="bricks" title="The bricks in the box today" body="Everything here works in the builder now. Anything marked soon is listed so you know it's coming, not because it runs.">
      <BrickGallery />
    </FramedSection>
  );
}
