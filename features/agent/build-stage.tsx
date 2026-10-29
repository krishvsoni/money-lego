"use client";

import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import { BrickGlyph } from "@/features/workflows/node-icon";
import type { PlanNode } from "./use-sage";

// The workflow taking shape while the crew works, in three honest states:
//   nothing yet:  ghost bricks shimmer where blocks will go
//   sketching:    each block appears dashed the moment the model writes its type, with one
//                 ghost after it showing more is coming
//   confirmed:    once Guard passes the plan, the real blocks seat solid, in the order money
//                 flows, each onto the line drawn from the one above
// Blocks keep their keys between states, so a sketched block firming up never replays.

const GHOSTS = [0, 1, 2, 3];

function Brick({ type, label, index, sketch }: { type: string; label: string | null; index: number; sketch: boolean }) {
  const def = nodeDefinition(type);
  if (!def) return null;
  const color = CATEGORY_META[def.category].color;
  return (
    <li className="flex flex-col items-start">
      {index > 0 && <span aria-hidden className="build-wire ml-[21px] h-3 w-0.5 rounded-full bg-line-strong" />}
      <span
        className={`brick-snap flex w-full items-center gap-2.5 rounded-xl py-2 pr-3 pl-2 text-sm font-semibold transition-[background-color,box-shadow,color] duration-300 ${
          sketch ? "bg-transparent text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)] [border-left-style:dashed]" : "bg-paper shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(9_9_11/0.05)]"
        }`}
        // Sketched blocks arrive one by one already; confirmed blocks that weren't sketched
        // first (a backup model answered) cascade in. A style change never replays a mount.
        style={{ ["--i" as string]: sketch ? 0 : index, borderLeft: `3px ${sketch ? "dashed" : "solid"} ${color}` }}
      >
        <BrickGlyph name={def.icon} color={color} />
        <span className="truncate">{label || def.title}</span>
        <span className="ml-auto shrink-0 text-xs font-medium text-ink-3">{sketch ? "Sketch" : CATEGORY_META[def.category].title}</span>
      </span>
    </li>
  );
}

export function BuildStage({ nodes, sketch = [] }: { nodes: PlanNode[] | null; sketch?: string[] }) {
  if (nodes) {
    return (
      <ol className="flex flex-col" aria-label="Blocks in this workflow, in order">
        {nodes.map((n, i) => (
          <Brick key={`b${i}`} type={n.type} label={n.label} index={i} sketch={false} />
        ))}
      </ol>
    );
  }
  if (sketch.length) {
    return (
      <ol className="flex flex-col" aria-label="Blocks the planner has written so far" aria-busy>
        {sketch.map((type, i) => (
          <Brick key={`b${i}`} type={type} label={null} index={i} sketch />
        ))}
        <li aria-hidden className="mt-3 h-9 rounded-xl build-ghost" />
      </ol>
    );
  }
  return (
    <ol className="flex flex-col gap-2" aria-label="Planning the workflow" aria-busy>
      {GHOSTS.map((i) => (
        <li key={i} className="build-ghost h-11 rounded-xl" style={{ ["--i" as string]: i }} />
      ))}
    </ol>
  );
}
