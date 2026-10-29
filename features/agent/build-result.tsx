"use client";

import Link from "next/link";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import { topologicalOrder } from "@/lib/workflow/validate";
import { Button, ButtonLink } from "@/components/ui/button";
import { BrickGlyph } from "@/features/workflows/node-icon";
import type { MasonResult } from "./use-mason";

// The blocks Mason chose, in the order money flows through them. Each one snaps in like a
// brick seating on the one before it; that is the only motion on the page.
export function BuildResult({ result, onReset }: { result: MasonResult; onReset: () => void }) {
  const { workflow, notes, setupIssues, linked, missing } = result;
  const order = topologicalOrder(workflow.graph) ?? workflow.graph.nodes.map((n) => n.id);
  const nodes = order.map((id) => workflow.graph.nodes.find((n) => n.id === id)!).filter(Boolean);
  const href = `/workflows/${workflow.id}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-ink-2">Built and saved, turned off</p>
        <Link href={href} className="headline mt-0.5 block text-xl hover:underline">
          {workflow.name}
        </Link>
        {workflow.description && <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{workflow.description}</p>}
      </div>

      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2" aria-label="Blocks in this workflow, in order">
        {nodes.map((n, i) => {
          const def = nodeDefinition(n.type);
          if (!def) return null;
          return (
            <li key={n.id} className="brick-snap flex items-center gap-1.5" style={{ ["--i" as string]: i }}>
              {i > 0 && <span className="h-px w-3 bg-line-strong" aria-hidden />}
              <span className="flex items-center gap-2 rounded-lg border border-line bg-paper py-1.5 pr-3 pl-1.5 text-sm font-semibold">
                <BrickGlyph name={def.icon} color={CATEGORY_META[def.category].color} />
                {n.label || def.title}
              </span>
            </li>
          );
        })}
      </ol>

      {linked.length > 0 && <p className="text-sm text-success">Already linked: {linked.join(", ")}</p>}

      {(missing.length > 0 || notes.length > 0 || setupIssues > 0) && (
        <div className="rounded-xl bg-sunken p-4">
          <p className="text-sm font-semibold">Before it can run</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            {setupIssues > 0 && (
              <li>
                {setupIssues} setting{setupIssues > 1 ? "s" : ""} to fill in. The editor marks each one.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={href}>Open and finish setup</ButtonLink>
        <Button variant="quiet" onClick={onReset}>
          Build another
        </Button>
      </div>
      <p className="text-xs text-ink-3">Every transfer in it waits for your approval and your wallet signature. Nothing has moved.</p>
    </div>
  );
}
