"use client";

import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import type { SageResult } from "./use-sage";

// What the crew built and what's left for the owner. The blocks themselves stay on the
// build stage above, so finishing never replays their entrance.
export function BuildResult({ result, onReset }: { result: SageResult; onReset: () => void }) {
  const { workflow, notes, setupIssues, linked, missing } = result;
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
