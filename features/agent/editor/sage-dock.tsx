"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import type { SageAction, SageFinding } from "../crew-stream";
import { ActivityLog } from "../activity-log";
import { CREW, type CrewId } from "../crew";
import { Sage, type SageMood } from "../sage";
import { useSageEdit, type EditorBridge, type ThreadItem } from "./use-sage-edit";

// Sage and the crew on the editor canvas. Closed, they wait in the top-right corner (they
// walk in once when the editor opens); open, it's a panel where you can ask Sage for any
// change in words or tap a crew member to have them do their one job on this workflow.

type Member = CrewId | "sage";

const JOBS: Record<Member, { action: string; hint: string }> = {
  sage: { action: "Ask Sage", hint: "Ask why something failed, what to do next, or for any change." },
  planner: { action: "Plan a change", hint: "Tell Planner what to add, remove or rewire." },
  guard: { action: "Check everything", hint: "Guard checks the settings, tests your accounts and PayPal, and reads the latest runs." },
  fixer: { action: "Fix what's broken", hint: "Fixer repairs what doesn't need your input." },
  connector: { action: "Link my accounts", hint: "Connector wires in accounts you've already connected." },
  builder: { action: "Tidy the canvas", hint: "Builder lays the blocks out in the order money flows." },
};

const NAME: Record<string, string> = { sage: "Sage", you: "You", ...Object.fromEntries(CREW.map((m) => [m.id, m.name])) };
const TINT: Record<string, string | undefined> = Object.fromEntries(CREW.map((m) => [m.id, m.tint]));

const FINDING: Record<SageFinding["level"], { Icon: typeof InfoIcon; tone: string; label: string }> = {
  blocker: { Icon: WarningCircleIcon, tone: "text-danger", label: "Needs you" },
  warn: { Icon: InfoIcon, tone: "text-attention", label: "Worth a look" },
  ok: { Icon: CheckCircleIcon, tone: "text-success", label: "Fine" },
};

function Findings({ items }: { items: SageFinding[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <ul className="mt-2 flex flex-col gap-1.5 rounded-xl bg-paper p-2.5 text-xs shadow-[0_0_0_1px_var(--line)]">
      {shown.map((f, i) => {
        const { Icon, tone, label } = FINDING[f.level];
        return (
          <li key={i} className="flex gap-2">
            <Icon size={15} weight="fill" className={`mt-px shrink-0 ${tone}`} aria-label={label} />
            <span className="min-w-0 leading-relaxed text-ink-2">{f.text}</span>
          </li>
        );
      })}
      {items.length > 5 && (
        <li>
          <button type="button" onClick={() => setAll((v) => !v)} className="press pl-[23px] font-semibold text-ink underline underline-offset-2">
            {all ? "Show fewer" : `Show ${items.length - 5} more`}
          </button>
        </li>
      )}
    </ul>
  );
}

function Message({ item, onUndo, onAction, busy }: { item: ThreadItem; onUndo: () => void; onAction: (a: SageAction) => void; busy: boolean }) {
  if (item.from === "you") {
    return <p className="blur-swap-in ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3 py-2 text-sm text-paper">{item.text}</p>;
  }
  const answer = Boolean(item.findings);
  return (
    <div className="blur-swap-in flex gap-2">
      <Sage mood={item.tone === "error" ? "error" : "done"} tint={TINT[item.from]} label={NAME[item.from]} className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{NAME[item.from]}</p>
        <p className={`leading-relaxed ${item.tone === "error" ? "text-danger" : "text-ink-2"}`}>{item.text}</p>
        {item.findings && item.findings.length > 0 && <Findings items={item.findings} />}
        {item.list && item.list.length > 0 &&
          (answer ? (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-2 marker:font-semibold marker:text-ink-3">
              {item.list.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          ) : (
            <ul className="mt-1 list-disc pl-4 text-xs text-ink-2">
              {item.list.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ))}
        {item.actions && item.actions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {item.actions.map((a, i) => (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => onAction(a)}
                className={`press rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${i === 0 ? "bg-ink text-paper hover:bg-[#27272a]" : "bg-paper text-ink shadow-[0_0_0_1px_var(--line-strong)] hover:bg-sunken"}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
        {item.undoable && (
          <button type="button" onClick={onUndo} className="press mt-1 text-xs font-semibold text-ink underline underline-offset-2">
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

export function SageDock({ bridge }: { bridge: EditorBridge }) {
  const sage = useSageEdit(bridge);
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState<Member>("sage");
  const [prompt, setPrompt] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Sage's one-click actions go through the editor's own controls, so they run the same
  // checks and show the same toasts as clicking the toolbar yourself.
  const runAction = (a: SageAction) => {
    if (a.kind === "enable") void bridge.setEnabled?.(true);
    else if (a.kind === "test") void bridge.testRun?.();
    else if (a.kind === "fix") void sage.fix();
    else if (a.kind === "link") void sage.link();
    else if (a.kind === "open") {
      if (a.href.startsWith("/pay/")) window.open(a.href, "_blank", "noopener,noreferrer");
      else router.push(a.href);
    }
  };

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [sage.thread.length]);

  const pick = (m: Member) => {
    setOpen(true);
    setMember(m);
    if (m === "sage" || m === "planner") requestAnimationFrame(() => input.current?.focus());
  };

  const act = () => {
    if (member === "guard") sage.check();
    else if (member === "fixer") void sage.fix();
    else if (member === "connector") void sage.link();
    else if (member === "builder") sage.tidy();
  };

  const send = () => {
    const text = prompt.trim();
    if (text.length < 4 || sage.busy) return;
    setPrompt("");
    void (member === "planner" ? sage.plan(text) : sage.ask(text));
  };

  const mood: SageMood = sage.busy ? "building" : "idle";

  if (!open) {
    return (
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-paper/90 py-1 pr-1 pl-1.5 shadow-[0_0_0_1px_var(--line),0_8px_24px_-12px_rgb(9_9_11/0.25)] backdrop-blur">
        <button type="button" onClick={() => pick("sage")} className="press flex items-center gap-2 rounded-full pr-3 hover:bg-sunken" aria-label="Open Sage">
          <span className="crew-arrive">
            <Sage mood={mood} follow className="h-10 w-10" />
          </span>
          <span className="text-sm font-semibold">Ask Sage</span>
        </button>
        <span aria-hidden className="h-6 w-px bg-line" />
        {CREW.map((m, i) => (
          <button key={m.id} type="button" onClick={() => pick(m.id)} aria-label={`${m.name}: ${JOBS[m.id].action}`} title={`${m.name}: ${JOBS[m.id].action}`} className="press crew-arrive rounded-full hover:bg-sunken" style={{ ["--i" as string]: i + 1 }}>
            <Sage mood={sage.crew[m.id].status === "working" ? "building" : "idle"} tint={m.tint} label={m.name} className="h-8 w-8" />
          </button>
        ))}
      </div>
    );
  }

  const job = JOBS[member];
  return (
    <aside
      aria-label="Sage"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      className="reveal absolute top-3 right-3 bottom-3 z-10 flex w-[360px] max-w-[calc(100%-1.5rem)] flex-col rounded-[22px] border border-line bg-surface shadow-[0_16px_40px_-18px_rgb(9_9_11/0.35)]"
    >
      <header className="flex items-center gap-2.5 px-4 pt-3.5">
        <Sage mood={mood} follow className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="headline text-lg leading-tight">Sage</p>
          <p className="text-xs text-ink-2">{sage.busy ? "The crew is working on this workflow" : "Ask anything about this workflow, or tap a crew member"}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close Sage" className="press rounded-full p-2 text-ink-2 hover:bg-sunken hover:text-ink">
          <XIcon size={16} weight="bold" />
        </button>
      </header>

      <div className="grid grid-cols-5 gap-1 px-3 pt-3" role="tablist" aria-label="Crew">
        {CREW.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={member === m.id}
            onClick={() => pick(m.id)}
            className={`press flex flex-col items-center rounded-xl py-1 transition-colors duration-150 ${member === m.id ? "bg-paper shadow-[0_0_0_1px_var(--line)]" : "hover:bg-paper/70"}`}
          >
            <Sage mood={sage.crew[m.id].status === "working" ? "building" : sage.crew[m.id].status === "done" ? "done" : "idle"} tint={m.tint} label={m.name} className="h-9 w-9" />
            <span className="text-[11px] font-semibold">{m.name}</span>
          </button>
        ))}
      </div>

      {member !== "sage" && member !== "planner" && (
        <div className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-2.5 shadow-[0_0_0_1px_var(--line)]">
          <p className="text-xs text-ink-2">{job.hint}</p>
          <button type="button" onClick={act} disabled={sage.busy} className="press shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-40">
            {job.action}
          </button>
        </div>
      )}

      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {!sage.thread.length && <p className="m-auto max-w-[26ch] text-center text-sm text-ink-3">Try “Why did my last run fail?”, “Is everything ready for a demo?” or “Pay every Monday instead”.</p>}
        {sage.thread.map((item) => (
          <Message key={item.id} item={item} onUndo={bridge.undo} onAction={runAction} busy={sage.busy} />
        ))}
      </div>

      {sage.busy && (
        <div className="px-3 pb-2">
          <ActivityLog lines={sage.logs} running />
        </div>
      )}

      <div className="m-3 mt-0 rounded-2xl bg-paper shadow-[0_0_0_1px_var(--line-strong)] transition-shadow duration-150 focus-within:shadow-[0_0_0_1.5px_var(--ink)]">
        <textarea
          ref={input}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          maxLength={1200}
          disabled={sage.busy}
          aria-label={member === "planner" ? "Tell Planner what to change" : "Ask Sage"}
          placeholder={member === "planner" ? "What should Planner change?" : "Ask a question or describe a change"}
          className="block w-full resize-none rounded-2xl bg-transparent px-3.5 pt-3 text-sm leading-relaxed placeholder:text-ink-3 focus:outline-none focus-visible:outline-none disabled:opacity-60"
        />
        <div className="flex justify-end px-2 pb-2">
          <button type="button" onClick={send} disabled={prompt.trim().length < 4 || sage.busy} aria-label="Send" className="press flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-25">
            {sage.busy ? <span className="pulse-dot h-2 w-2 rounded-full bg-current" aria-hidden /> : <ArrowUpIcon size={16} weight="bold" aria-hidden />}
          </button>
        </div>
      </div>
    </aside>
  );
}
