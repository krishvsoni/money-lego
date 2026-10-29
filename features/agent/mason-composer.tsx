"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/use-resource";
import { BuildResult } from "./build-result";
import { CrewList } from "./crew-list";
import { Mason, type MasonMood } from "./mason";
import { MIN_PROMPT, useMason } from "./use-mason";

// Mason's side panel: describe the payment and his crew builds it, step by step, while
// you watch. Building it yourself on a blank canvas sits right beside him as an equal.

const EXAMPLES = [
  { label: "Pay two people now", prompt: "Send 25 USDC to Alice and 10 USDC to Bob right now, after I approve. I'll paste their wallets in the editor." },
  { label: "Weekly payroll", prompt: "Every Friday at 17:00 Europe/London, pay approved contributors from my Google Sheet in USDC, ask me to approve, then post the result to Slack." },
  { label: "AI agent invoices", prompt: "When my AI agent posts a signed invoice to a webhook with invoiceId, wallet and amount, pay it once per invoice in USDC if it's under 50 USDC, after my approval, and send me a Telegram message." },
  { label: "Affiliate share", prompt: "When a Stripe invoice is paid, send 20% of it in USDC to my affiliate partner's wallet after my approval, then notify Discord." },
  { label: "OTC settlement", prompt: "When my desk posts a signed webhook with a dealId, counterparty wallet and USDC amount, settle each deal once after my approval and send the receipt to my Telegram." },
];

const LINE: Record<MasonMood, string> = {
  idle: "Tell me who to pay, when and from where. My crew picks the blocks and wires the whole transfer.",
  listening: "Tell me who to pay, when and from where. My crew picks the blocks and wires the whole transfer.",
  building: "My crew is on it. Watch each step below.",
  done: "Done. Here's what we built.",
  offline: "Mason isn't available",
  error: "We couldn't build that one.",
};

export function MasonComposer({ onManual, manualBusy }: { onManual: () => void; manualBusy: boolean }) {
  const config = useResource<{ agentReady: boolean }>("/api/config");
  const { state, crew, build, reset } = useMason();
  const [prompt, setPrompt] = useState("");
  // He looks down at the box while you write in it, so it's clear he's the one reading.
  const [focused, setFocused] = useState(false);

  const offline = config.data ? !config.data.agentReady : false;
  const mood: MasonMood = state.phase === "building" ? "building" : state.phase === "done" ? "done" : state.phase === "error" ? "error" : focused ? "listening" : "idle";
  const busy = state.phase === "building";
  const ready = prompt.trim().length >= MIN_PROMPT;
  const showCrew = state.phase !== "idle";

  if (offline) {
    return (
      <section aria-label="Mason" className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line bg-surface px-5 py-4">
        <div className="flex items-center gap-3">
          <Mason mood="offline" className="h-10 w-10 shrink-0" />
          <p className="font-semibold text-ink-2">Mason isn&apos;t available</p>
        </div>
        <Button variant="secondary" onClick={onManual} busy={manualBusy}>
          Build it myself
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="mason-title" className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-5">
      <div className="flex items-center gap-3.5">
        <Mason mood={mood} label={busy ? "Mason, building your workflow" : "Mason"} className="h-16 w-16 shrink-0" />
        <div className="min-w-0">
          <h2 id="mason-title" className="headline text-2xl">
            Mason
          </h2>
          <p className="text-sm text-ink-2" aria-live="polite">
            {LINE[mood]}
          </p>
        </div>
      </div>

      {state.phase === "done" ? (
        <BuildResult
          result={state.result}
          onReset={() => {
            setPrompt("");
            reset();
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            aria-label="Describe the payment workflow"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) void build(prompt);
            }}
            maxLength={1200}
            rows={4}
            disabled={busy}
            placeholder="Every Friday, pay my contributors from the sheet in USDC after I approve, then tell Slack."
            className="block w-full resize-y rounded-xl border border-line-strong bg-paper px-3.5 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-3 transition-[border-color] duration-150 hover:border-ink-3 focus:border-ink focus:outline-none disabled:opacity-60"
          />
          {!busy && (
            <div className="flex flex-wrap gap-1.5" aria-label="Examples">
              {EXAMPLES.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={() => setPrompt(x.prompt)}
                  className="press rounded-full bg-paper px-3 py-1.5 text-xs font-semibold text-ink-2 ring-1 ring-line hover:text-ink hover:ring-line-strong"
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
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onManual} busy={manualBusy} disabled={busy}>
              Build it myself
            </Button>
            <Button onClick={() => build(prompt)} busy={busy} disabled={!ready}>
              {busy ? "Building" : "Build with Mason"}
            </Button>
          </div>
          <p className="text-xs text-ink-3">What you type goes to an AI model. Never include a private key or seed phrase.</p>
        </div>
      )}

      {showCrew && (
        <div className="reveal border-t border-line pt-4">
          <CrewList crew={crew} />
        </div>
      )}
    </section>
  );
}
