"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpIcon, XIcon } from "@phosphor-icons/react";
import { BlurSwap } from "@/components/ui/blur-swap";
import type { LogLine } from "./activity-log";
import { ActivityLog } from "./activity-log";
import { BuildResult } from "./build-result";
import { BuildStage } from "./build-stage";
import { CREW, type CrewState } from "./crew";
import { nowLine } from "./crew-list";
import { CrewRail } from "./crew-rail";
import { PromptChip } from "./prompt-chip";
import type { PlanNode, SageResult } from "./use-sage";

// The build leaves the narrow column and opens as a large sheet in the middle of the page.
// The crew works along a rail at the top; the blocks they agree on seat below it, next to
// the brief and the live activity. Nothing here glows, orbits, or pretends to think.

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-3">{children}</p>;
}

export function OrchestrationModal({
  open,
  phase,
  prompt,
  onPrompt,
  onSubmit,
  ready,
  examples,
  crew,
  plan,
  sketch,
  logs,
  result,
  error,
  onDismiss,
}: {
  open: boolean;
  phase: "write" | "building" | "done" | "error";
  prompt: string;
  onPrompt: (next: string) => void;
  onSubmit: () => void;
  ready: boolean;
  examples: { label: string; prompt: string }[];
  crew: CrewState;
  plan: PlanNode[] | null;
  sketch: string[];
  logs: LogLine[];
  result: SageResult | null;
  error: string | null;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const building = phase === "building";
  const writing = phase === "write";

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    return () => {
      if (el.open) el.close();
    };
  }, [open]);

  useEffect(() => {
    if (open && writing) field.current?.focus();
  }, [open, writing]);

  const title = phase === "done" ? "Here's your workflow" : phase === "error" ? "That one didn't work" : writing ? "Who should I pay, and when?" : "The crew is on it";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="stage-title"
      className="stage-dialog"
      data-size={writing ? "compact" : "wide"}
      onCancel={(e) => {
        e.preventDefault();
        if (!building) onDismiss();
      }}
    >
      <div className="flex flex-col">
        <header className="flex items-start justify-between gap-6 px-4 pt-7 pb-2 sm:px-8">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-3">SAGE&apos;S CREW</p>
            <h2 id="stage-title" className="headline mt-1 text-3xl">
              <BlurSwap text={title} />
            </h2>
            {!writing && (
              <p className="mt-1 text-sm text-ink-2" aria-live="polite">
                <BlurSwap text={phase === "error" && error ? error : nowLine(crew)} />
              </p>
            )}
          </div>
          {!building && (
            <button type="button" onClick={onDismiss} aria-label="Close" className="press -mr-1 rounded-full p-2 text-ink-2 hover:bg-sunken hover:text-ink">
              <XIcon size={18} aria-hidden />
            </button>
          )}
        </header>

        {writing ? (
          <div key="write" className="stage-swap flex flex-col gap-4 px-4 pt-2 pb-8 sm:px-8">
            <div className="rounded-2xl bg-paper shadow-[0_0_0_1px_var(--line-strong)] focus-within:shadow-[0_0_0_1.5px_var(--ink)]">
              {/* The box grows with what you type up to about a third of the screen, then
                  scrolls inside itself, so a long pasted prompt never pushes the title, the
                  suggestions or the send button out of the sheet. */}
              <div className="grid max-h-[min(38dvh,20rem)] min-h-36 overflow-y-auto rounded-t-2xl [mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)]">
                <div aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words px-5 py-4 text-base leading-relaxed">
                  {prompt + "\n"}
                </div>
                <textarea
                  ref={field}
                  aria-label="Describe the payment workflow"
                  value={prompt}
                  onChange={(e) => onPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) onSubmit();
                  }}
                  maxLength={4000}
                  placeholder="Pay my team from the sheet every Friday…"
                  className="col-start-1 row-start-1 h-full min-h-0 w-full resize-none overflow-hidden bg-transparent px-5 py-4 text-base leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5 pr-3 pb-3 pl-5">
                <span className="text-xs text-ink-3">
                  Ctrl + Enter to build
                  {prompt.length > 600 && <span className="num"> · {prompt.length.toLocaleString()} / 4,000</span>}
                </span>
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!ready}
                  aria-label="Build with Sage"
                  className="press flex h-10 w-10 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-25"
                >
                  <ArrowUpIcon size={18} weight="bold" aria-hidden />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" aria-label="Examples">
              {examples.map((x, i) => (
                <PromptChip key={x.label} label={x.label} tint={CREW[i % CREW.length].tint} onClick={() => onPrompt(x.prompt)} />
              ))}
            </div>
          </div>
        ) : (
          <div key="build" className="stage-swap flex min-h-0 flex-1 flex-col gap-6 px-4 pt-4 pb-8 sm:px-8">
            <div className="mx-auto w-full max-w-[600px]">
              <CrewRail crew={crew} running={building} />
            </div>
            <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
              <section aria-label="Workflow" className="min-w-0">
                <Eyebrow>{plan ? "WORKFLOW" : sketch.length ? "SKETCHING" : "PLANNING"}</Eyebrow>
                <BuildStage nodes={plan} sketch={sketch} />
              </section>
              <div className="flex min-w-0 flex-col gap-4">
                <section aria-label="Your request">
                  <Eyebrow>BRIEF</Eyebrow>
                  <p className="max-h-48 overflow-y-auto overscroll-contain whitespace-pre-wrap rounded-2xl bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-2">{prompt}</p>
                </section>
                <ActivityLog lines={logs} running={building} listClassName="max-h-56" />
              </div>
            </div>
            {phase === "done" && result && (
              <div className="reveal border-t border-line pt-5">
                <BuildResult result={result} onReset={onDismiss} />
              </div>
            )}
            {phase === "error" && error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
