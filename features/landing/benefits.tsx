import { Fragment } from "react";
import { RotateCcw, UserCheck, type LucideIcon } from "lucide-react";
import { formatAmount, splitByPercent } from "@/lib/amounts";
import { BENEFITS } from "./content";
import { Reveal } from "./reveal";

// Four guarantees, each proved by one line of bricks: the inputs as white chips, joined
// by operators, ending in a single dark chip that is the result. Same chip language as
// the hero and the gallery, so the section reads as the product, not a spreadsheet.

interface Chip {
  text: string;
  icon?: { Icon: LucideIcon; color: string };
}

interface Equation {
  parts: Chip[];
  op: string;
  last?: string;
  result: string;
}

const SPLIT = splitByPercent(100_000_000n, [3_333, 3_333, 3_334]);
const usdc = (raw: bigint) => formatAmount(raw, 6, 2);
const total = SPLIT.reduce((a, b) => a + b, 0n);

// Same order as BENEFITS in content.ts.
const EQUATIONS: Equation[] = [
  {
    parts: SPLIT.map((p) => ({ text: usdc(p) })),
    op: "+",
    result: `${usdc(total)} USDC`,
  },
  {
    parts: [
      { text: "Approval", icon: { Icon: UserCheck, color: "var(--attention)" } },
      { text: "Restart", icon: { Icon: RotateCcw, color: "var(--ink-3)" } },
    ],
    op: "→",
    last: "→",
    result: "Resumed",
  },
  {
    parts: [{ text: "Delivery" }, { text: "Retry" }, { text: "Retry" }],
    op: "+",
    result: "1 payout",
  },
  {
    parts: [{ text: "2,500.00" }, { text: "12.50 fee" }],
    op: "−",
    result: "2,487.50 USDC",
  },
];

export function BenefitGrid() {
  return (
    <ul className="mx-auto grid max-w-[1040px] gap-4 md:grid-cols-2">
      {BENEFITS.map((b, i) => (
        <Reveal as="li" key={b.title} delay={i * 80} className="tactile flex flex-col rounded-2xl p-2">
          <EquationStrip eq={EQUATIONS[i]} />
          <div className="px-4 pb-4 pt-5 [@media(max-height:860px)]:pb-3 [@media(max-height:860px)]:pt-4">
            <h3 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink [@media(max-height:860px)]:text-xl">{b.title}</h3>
            <p className="mt-2 text-base text-ink-2 text-pretty [@media(max-height:860px)]:mt-1">{b.body}</p>
          </div>
        </Reveal>
      ))}
    </ul>
  );
}

function EquationStrip({ eq }: { eq: Equation }) {
  return (
    <div className="tactile-soft flex min-h-20 flex-wrap items-center justify-center gap-2 rounded-lg px-4 py-4 [@media(max-height:860px)]:min-h-16 [@media(max-height:860px)]:py-3">
      {eq.parts.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <Op>{eq.op}</Op>}
          <span className="tactile num inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-medium text-ink">
            {c.icon && <c.icon.Icon className="h-4 w-4" style={{ color: c.icon.color }} strokeWidth={2} aria-hidden />}
            {c.text}
          </span>
        </Fragment>
      ))}
      <Op>{eq.last ?? "="}</Op>
      <span className="tactile-ink num inline-flex h-9 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold">{eq.result}</span>
    </div>
  );
}

function Op({ children }: { children: string }) {
  return (
    <span className="num w-3 text-center text-base text-ink-3" aria-hidden>
      {children}
    </span>
  );
}
