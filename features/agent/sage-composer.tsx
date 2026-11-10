"use client";

import { useState } from "react";
import { BlurSwap } from "@/components/ui/blur-swap";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/use-resource";
import { CREW } from "./crew";
import { OrchestrationModal } from "./orchestration-modal";
import { PromptChip } from "./prompt-chip";
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
  const { focused, reaction, react, focus } = useReaction();
  const [prompt, setPrompt] = useState("");
  const [writing, setWriting] = useState(false);

  const offline = config.data ? !config.data.agentReady : false;
  const busy = state.phase === "building";
  const ready = prompt.trim().length >= MIN_PROMPT;
  // Sending a prompt opens the crew on a sheet in the middle of the page. The column keeps
  // the box, so the prompt is still here when the sheet closes.
  const dismiss = () => {
    if (state.phase === "building") return;
    if (state.phase === "done") {
      setPrompt("");
      setWriting(false);
      reset();
      return;
    }
    if (state.phase === "error") {
      reset();
      setWriting(true);
      return;
    }
    setWriting(false);
  };
  const phase = state.phase === "idle" ? (writing ? "write" : null) : state.phase;
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

      <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              focus();
              setWriting(true);
            }}
            disabled={busy}
            className="press min-h-[5.75rem] w-full rounded-2xl bg-paper px-4 py-3.5 text-left text-[15px] leading-relaxed shadow-[0_0_0_1px_var(--line-strong)] hover:shadow-[0_0_0_1.5px_var(--ink)] disabled:opacity-60"
          >
            {prompt ? <span className="line-clamp-4 whitespace-pre-wrap text-ink">{prompt}</span> : <span className="text-ink-3">Pay my team from the sheet every Friday…</span>}
          </button>

          {!busy && (
            <div className="grid grid-cols-2 gap-1.5" aria-label="Examples">
              {EXAMPLES.map((x, i) => (
                <PromptChip
                  key={x.label}
                  label={x.label}
                  tint={CREW[i % CREW.length].tint}
                  onClick={() => {
                    edit(x.prompt);
                    setWriting(true);
                  }}
                />
              ))}
            </div>
          )}

          <Button variant="secondary" onClick={onManual} busy={manualBusy} disabled={busy} className="w-full">
            Build it myself instead
          </Button>
          <p className="text-center text-xs text-ink-3">What you type goes to an AI model. Never include a private key or seed phrase.</p>
      </div>

      {phase && (
        <OrchestrationModal
          open
          phase={phase}
          prompt={phase === "write" ? prompt : sent}
          onPrompt={edit}
          onSubmit={() => void build(prompt)}
          ready={ready}
          examples={EXAMPLES}
          crew={crew}
          plan={plan}
          sketch={sketch}
          logs={logs}
          result={state.phase === "done" ? state.result : null}
          error={state.phase === "error" ? state.message : null}
          onDismiss={dismiss}
        />
      )}
    </section>
  );
}
