"use client";

import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import { BrickGlyph } from "@/features/workflows/node-icon";
import type { PlanNode } from "./use-sage";

// The workflow taking shape while the crew works. Before the plan exists, ghost bricks
// shimmer where blocks will go. When Planner's plan clears Guard, the real blocks drop in
// one after another, in the order money flows, each seating onto the line drawn from the
// one above. Blocks keep their keys, so the finished result never replays the entrance.

const GHOSTS = [0, 1, 2, 3];

export function BuildStage({ nodes }: { nodes: PlanNode[] | null }) {
  if (!nodes) {
    return (
      <ol className="flex flex-col gap-2" aria-label="Planning the workflow" aria-busy>
        {GHOSTS.map((i) => (
          <li key={i} className="build-ghost h-11 rounded-xl" style={{ ["--i" as string]: i }} />
        ))}
      </ol>
    );
  }

  return (
    <ol className="flex flex-col" aria-label="Blocks in this workflow, in order">
      {nodes.map((n, i) => {
        const def = nodeDefinition(n.type);
        if (!def) return null;
        const color = CATEGORY_META[def.category].color;
        return (
          <li key={n.id} className="flex flex-col items-start">
            {i > 0 && <span aria-hidden className="build-wire ml-[21px] h-3 w-0.5 rounded-full bg-line-strong" style={{ ["--i" as string]: i }} />}
            <span
              className="brick-snap flex w-full items-center gap-2.5 rounded-xl bg-paper py-2 pr-3 pl-2 text-sm font-semibold shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(9_9_11/0.05)]"
              style={{ ["--i" as string]: i, borderLeft: `3px solid ${color}` }}
            >
              <BrickGlyph name={def.icon} color={color} />
              <span className="truncate">{n.label || def.title}</span>
              <span className="ml-auto shrink-0 text-xs font-medium text-ink-3">{CATEGORY_META[def.category].title}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
