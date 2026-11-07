"use client";

import { useState } from "react";
import { ArrowUpIcon } from "@phosphor-icons/react";
import { BlurSwap } from "@/components/ui/blur-swap";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/use-resource";
import { BuildResult } from "./build-result";
import { ActivityLog } from "./activity-log";
import { BuildStage } from "./build-stage";
import { CrewList } from "./crew-list";
import { Sage, type SageMood } from "./sage";
import { MIN_PROMPT, useSage } from "./use-sage";
import { useReaction } from "./use-reaction";

// Sage's side panel: describe the payment and his crew builds it, step by step, while
// you watch. Building it yourself on a blank canvas stays one tap away under the composer.

const EXAMPLES = [
  { label: "Revenue split", prompt: "When a client pays my $100 PayPal checkout, split the net 70% to the creator, 20% to the agency and keep 10% as operations reserve. Show me the amounts with an AI risk check, require my approval, then send PayPal payouts and notify Slack when everyone is paid." },
  { label: "Invoice reminders", prompt: "Every Monday at 9:00 America/New_York, find my overdue PayPal invoices, have AI draft a friendly reminder for each, let me review them, then send the reminders through PayPal and post a summary to Slack." },
  { label: "Failed subscriptions", prompt: "When a PayPal subscription payment fails, load the subscription, have AI explain why it failed, alert my team on Slack, and if a balance is outstanding draft a catch-up invoice that I approve before PayPal sends it." },
  { label: "Refund desk", prompt: "When I run it with a capture id, amount and reason, check the request with AI, ask me to approve, refund it through PayPal once per capture, and log the result." },
  { label: "Weekly digest", prompt: "Every Friday at 17:00, read the last 7 days of PayPal transactions, have AI write a short digest of totals, refunds and anything unusual, and post it to Slack." },
  { label: "Invoice a client", prompt: "When I run it with a client email, project name and amount, create a PayPal invoice due in 14 days, let me approve it, then send it through PayPal and tell me on Telegram." },
];

const GREETING = "Who should I pay, and when?";

const LINE: Record<SageMood, string> = {
  idle: GREETING,
  listening: GREETING,
  excited: "Ooh, keep going.",
  sad: "Changing your mind?",
  surprised: "Fresh start.",
  building: "My crew is on it.",
  done: "Done. Here's your workflow.",
  offline: "Sage isn't available",
  error: "That one didn't work.",
};

// A soft grey surface with a hairline edge, so the panel reads as its own place on a white
// page while Sage, the composer and the blocks stay white on top of it.
const PANEL = "rounded-[24px] border border-line bg-surface";

export function SageComposer({ onManual, manualBusy }: { onManual: () => void; manualBusy: boolean }) {
  const config = useResource<{ agentReady: boolean }>("/api/config");
  const { state, crew, plan, sketch, logs, sent, build, reset } = useSage();
  const { focused, reaction, react, focus, blur } = useReaction();
  const [prompt, setPrompt] = useState("");

  const offline = config.data ? !config.data.agentReady : false;
  const busy = state.phase === "building";
  const ready = prompt.trim().length >= MIN_PROMPT;
  // Once a prompt is sent, the composer steps aside for the build: what you asked, the
  // workflow assembling, and the crew at work. An error brings the composer back, text kept.
  const working = state.phase === "building" || state.phase === "done";
  const mood: SageMood =
    state.phase === "building" ? "building" : state.phase === "done" ? "done" : state.phase === "error" ? "error" : (reaction ?? (focused ? "listening" : "idle"));

  const edit = (next: string) => {
    react(prompt, next);
    setPrompt(next);
    if (state.phase === "error") reset();
  };

  if (offline) {
    return (
      <section aria-label="Sage" className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${PANEL}`}>
        <div className="flex items-center gap-3">
          <Sage mood="offline" className="h-12 w-12 shrink-0" />
          <p className="font-semibold text-ink-2">Sage isn&apos;t available</p>
        </div>
        <Button variant="secondary" onClick={onManual} busy={manualBusy}>
          Build it myself
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="sage-title" className={`flex flex-col gap-5 p-4 ${PANEL}`}>
      <header className="flex flex-col items-center pt-2 text-center">
        <Sage mood={mood} follow label={busy ? "Sage, building your workflow" : "Sage"} className="h-24 w-24" />
        <h2 id="sage-title" className="headline mt-1 text-2xl">
          Sage
        </h2>
        <BlurSwap text={LINE[mood]} className="mt-0.5 text-sm font-semibold text-ink-2" />
        {/* Reactions to typing change the line above many times a minute; only real progress is announced. */}
        <p className="sr-only" aria-live="polite">
          {busy ? LINE.building : state.phase === "done" ? LINE.done : state.phase === "error" ? LINE.error : ""}
        </p>
      </header>

      {working ? (
        <div className="flex flex-col gap-5">
          <p className="reveal ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-paper">{sent}</p>
          <BuildStage nodes={plan} sketch={sketch} />
          <CrewList crew={crew} />
          <ActivityLog lines={logs} running={busy} />
          {state.phase === "done" && (
            <div className="reveal border-t border-line pt-4">
              <BuildResult
                result={state.result}
                onReset={() => {
                  setPrompt("");
                  reset();
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl bg-paper shadow-[0_0_0_1px_var(--line-strong)] transition-shadow duration-150 focus-within:shadow-[0_0_0_1.5px_var(--ink)]">
            <textarea
              aria-label="Describe the payment workflow"
              value={prompt}
              onChange={(e) => edit(e.target.value)}
              onFocus={focus}
              onBlur={blur}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) void build(prompt);
              }}
              maxLength={1200}
              rows={3}
              disabled={busy}
              placeholder="Pay my team from the sheet every Friday…"
              className="block w-full resize-none rounded-2xl bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none focus-visible:outline-none disabled:opacity-60"
            />
            <div className="flex justify-end px-2.5 pb-2.5">
              <button
                type="button"
                onClick={() => build(prompt)}
                disabled={!ready || busy}
                aria-label={busy ? "Building" : "Build with Sage"}
                className="press flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper transition-opacity duration-150 disabled:opacity-25"
              >
                {busy ? <span className="pulse-dot h-2 w-2 rounded-full bg-current" aria-hidden /> : <ArrowUpIcon size={18} weight="bold" aria-hidden />}
              </button>
            </div>
          </div>

          {!busy && (
            <div className="grid grid-cols-2 gap-1.5" aria-label="Examples">
              {EXAMPLES.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={() => edit(x.prompt)}
                  className="press truncate rounded-xl bg-paper px-3 py-2 text-left text-xs font-semibold text-ink-2 shadow-[0_0_0_1px_var(--line)] hover:text-ink hover:shadow-[0_0_0_1px_var(--line-strong)]"
                >
                  {x.label}
                </button>
              ))}
            </div>
          )}

          {state.phase === "error" && (
            <p role="alert" className="text-sm font-semibold text-danger">
              {state.message}
            </p>
          )}

          <Button variant="secondary" onClick={onManual} busy={manualBusy} disabled={busy} className="w-full">
            Build it myself instead
          </Button>
          <p className="text-center text-xs text-ink-3">What you type goes to an AI model. Never include a private key or seed phrase.</p>
        </div>
      )}
    </section>
  );
}
