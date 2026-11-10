"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType, type FormEvent } from "react";
import { ArrowUp, ArrowUpRight, CalendarClock, ChartLine, CircleAlert, MessageCircle, ReceiptText, Search, Workflow, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import type { AssistantReply } from "@/server/ai/assistant";
import { Markdown } from "./markdown";

// The Money Lego assistant, one click away on every app page. A plain chat, on purpose: Sage
// is the workflow editor's agent, and this is a different helper with its own look. It answers from PayPal (through the read-only PayPal agent),
// run history and Money Lego's ledger, and turns "do this" into a workflow draft. Each answer
// shows which agents and tools it used, so nothing is a black box.

interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: AssistantReply["steps"];
  workflow?: AssistantReply["workflow"];
}

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

// Starters say what kind of help each one is, with the brick colour of that kind.
const STARTERS: Array<{ text: string; kind: string; Icon: Icon; tint: string }> = [
  { text: "Which invoices are unpaid right now?", kind: "Look up in PayPal", Icon: ReceiptText, tint: "var(--brick-2)" },
  { text: "Summarise my PayPal transactions this week", kind: "Look up in PayPal", Icon: ChartLine, tint: "var(--brick-5)" },
  { text: "Why did my last payout run fail?", kind: "Explain a failure", Icon: CircleAlert, tint: "var(--brick-3)" },
  { text: "Every Monday, remind clients about overdue invoices after I approve", kind: "Build a workflow", Icon: CalendarClock, tint: "var(--brick-4)" },
];

const STEP_ICON: Record<string, Icon> = {
  "PayPal agent": ReceiptText,
  "Workflow builder": Workflow,
  "Run search": Search,
  "Product search": Search,
  Payments: ChartLine,
};

function Tile({ Icon, tint, size = "md" }: { Icon: Icon; tint: string; size?: "sm" | "md" }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${size === "md" ? "h-8 w-8" : "h-5 w-5 rounded-md"}`}
      style={{ background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }}
      aria-hidden
    >
      <Icon className={size === "md" ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
    </span>
  );
}

// The assistant's mark: a chat bubble on a cobalt tile, in place of an avatar.
function ChatMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10 rounded-xl" : size === "md" ? "h-9 w-9 rounded-full" : "h-7 w-7 rounded-full";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  return (
    <span className={`flex shrink-0 items-center justify-center bg-[var(--brick-1)] text-white ${box}`} aria-hidden>
      <MessageCircle className={icon} strokeWidth={2.25} aria-hidden />
    </span>
  );
}

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await api<AssistantReply>("/api/assistant", { body: { messages: next.map(({ role, content: c }) => ({ role, content: c })) } });
      setMessages([...next, { role: "assistant", content: res.reply, steps: res.steps, workflow: res.workflow }]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press fixed right-6 bottom-6 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-paper py-1 pr-4 pl-1.5 text-sm font-semibold text-ink shadow-[0_0_0_1px_var(--line),0_12px_32px_-12px_rgb(9_9_11/0.35)] hover:bg-sunken"
        aria-label="Open the Money Lego assistant"
      >
        <ChatMark />
        Ask Money Lego
      </button>
    );
  }

  return (
    <section
      aria-label="Money Lego assistant"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      className="reveal fixed right-6 bottom-6 z-40 flex h-[min(660px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_24px_64px_-24px_rgb(9_9_11/0.45)]"
    >
      <header className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <ChatMark size="lg" />
        <div className="min-w-0 flex-1">
          <p className="headline text-lg leading-tight">Money Lego assistant</p>
          <p className="truncate text-xs text-ink-2">{busy ? "Checking with PayPal and your runs" : "Answers from PayPal sandbox and your runs"}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="press rounded-full p-2 text-ink-2 hover:bg-sunken hover:text-ink" aria-label="Close assistant">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={scroller} className="flex flex-1 flex-col gap-4 overflow-y-auto border-t border-line px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[0.9375rem] font-semibold text-ink">How can I help?</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-2">I look things up in PayPal, explain failed runs, and build workflows that wait for your approval before money moves.</p>
            </div>
            <ul className="flex flex-col gap-2">
              {STARTERS.map((s) => (
                <li key={s.text}>
                  <button
                    type="button"
                    onClick={() => void send(s.text)}
                    className="press group flex w-full items-start gap-3 rounded-xl bg-paper px-3 py-2.5 text-left shadow-[0_0_0_1px_var(--line)] transition-shadow duration-150 hover:shadow-[0_0_0_1px_var(--line-strong),0_4px_12px_-6px_rgb(9_9_11/0.15)]"
                  >
                    <Tile Icon={s.Icon} tint={s.tint} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug font-medium text-ink">{s.text}</span>
                      <span className="mt-0.5 block text-[0.6875rem] font-semibold" style={{ color: s.tint }}>
                        {s.kind}
                      </span>
                    </span>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-3 transition-colors group-hover:text-ink" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="blur-swap-in ml-10 self-end rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm whitespace-pre-wrap text-paper">
              {m.content}
            </p>
          ) : (
            <div key={i} className="blur-swap-in flex gap-2.5">
              <ChatMark size="sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {m.steps && m.steps.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="What the assistant checked">
                    {m.steps.map((s, k) => {
                      const StepIcon = STEP_ICON[s.agent] ?? Search;
                      return (
                        <li
                          key={k}
                          title={s.detail}
                          className={`inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-1 text-[0.6875rem] ${s.ok ? "bg-paper text-ink-2 shadow-[0_0_0_1px_var(--line)]" : "bg-attention-wash text-attention"}`}
                        >
                          <Tile Icon={StepIcon} tint={s.ok ? "var(--brick-1)" : "var(--attention)"} size="sm" />
                          <span className="font-semibold text-ink">{s.agent}</span>
                          <span className="truncate">{s.detail}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Markdown>{m.content}</Markdown>
                {m.workflow && (
                  <Link
                    href={`/workflows/${m.workflow.id}`}
                    className="press flex items-center gap-2.5 self-start rounded-xl bg-paper py-2 pr-3 pl-2 text-sm font-semibold text-ink shadow-[0_0_0_1px_var(--line-strong)] hover:bg-sunken"
                  >
                    <Tile Icon={Workflow} tint="var(--brick-4)" />
                    <span className="min-w-0">
                      <span className="block truncate">{m.workflow.name}</span>
                      <span className="block text-[0.6875rem] font-medium text-ink-3">Open the draft workflow</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-ink-3" aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2.5" aria-live="polite">
            <ChatMark size="sm" />
            <span className="flex items-center gap-1 rounded-full bg-paper px-3 py-2 shadow-[0_0_0_1px_var(--line)]" aria-label="The assistant is working">
              {[0, 1, 2].map((d) => (
                <span key={d} className="pulse-dot h-1.5 w-1.5 rounded-full bg-ink-3" style={{ animationDelay: `${d * 160}ms` }} />
              ))}
            </span>
          </div>
        )}
        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-danger-wash px-3 py-2 text-xs leading-relaxed text-danger" role="alert">
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="m-3 mt-0 rounded-2xl bg-paper shadow-[0_0_0_1px_var(--line-strong)] transition-shadow duration-150 focus-within:shadow-[0_0_0_1.5px_var(--ink)]">
        <textarea
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Ask about payments, or describe an automation"
          aria-label="Message the assistant"
          className="block max-h-32 w-full resize-none rounded-2xl bg-transparent px-3.5 pt-3 text-sm leading-relaxed outline-none placeholder:text-ink-3"
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <span className="text-[0.6875rem] text-ink-3">Enter to send, Shift+Enter for a new line</span>
          <button type="submit" disabled={busy || !draft.trim()} className="press flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-25" aria-label="Send">
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
