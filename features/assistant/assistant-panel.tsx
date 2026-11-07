"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import type { AssistantReply } from "@/server/ai/assistant";

// The Money Lego assistant, one click away on every app page. It answers from PayPal (through
// the read-only PayPal agent), run history and Money Lego's ledger, and turns "do this" into a
// workflow draft. Each answer shows which agents and tools it used, so nothing is a black box.

interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: AssistantReply["steps"];
  workflow?: AssistantReply["workflow"];
}

const STARTERS = [
  "Which invoices are unpaid right now?",
  "Summarise my PayPal transactions this week",
  "Why did my last payout run fail?",
  "Every Monday, remind clients about overdue invoices after I approve",
];

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

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

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press fixed bottom-6 right-6 z-40 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-white shadow-[0_12px_32px_-12px_rgb(9_9_11/0.5)] hover:bg-[#27272a]"
        >
          <Sparkles className="h-4 w-4" aria-hidden /> Ask Money Lego
        </button>
      )}
      {open && (
        <section aria-label="Money Lego assistant" className="reveal fixed bottom-6 right-6 z-40 flex h-[min(640px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_64px_-24px_rgb(9_9_11/0.45)]">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-[var(--brick-1)]" aria-hidden /> Money Lego assistant
              </p>
              <p className="text-xs text-ink-3">Looks things up in PayPal. Builds workflows for anything that moves money.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="press rounded-full p-1.5 text-ink-2 hover:bg-sunken" aria-label="Close assistant">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={scroller} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-2">Try one of these:</p>
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} className="press rounded-xl border border-line px-3 py-2 text-left text-sm text-ink hover:bg-sunken">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <p key={i} className="ml-8 self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-white">
                  {m.content}
                </p>
              ) : (
                <div key={i} className="mr-6 flex flex-col gap-2">
                  {m.steps && m.steps.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {m.steps.map((s, k) => (
                        <li key={k} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] ${s.ok ? "border-line bg-paper text-ink-2" : "border-attention/30 bg-attention-wash text-attention"}`} title={s.detail}>
                          <span className="font-semibold text-ink">{s.agent}</span>
                          <span className="max-w-[180px] truncate">{s.detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-sunken px-3.5 py-2 text-sm text-ink">{m.content}</p>
                  {m.workflow && (
                    <Link href={`/workflows/${m.workflow.id}`} className="press self-start rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#27272a]">
                      Open “{m.workflow.name}”
                    </Link>
                  )}
                </div>
              ),
            )}
            {busy && <p className="text-xs text-ink-3">Working with the PayPal agent and tools…</p>}
            {error && <p className="rounded-xl bg-danger-wash px-3 py-2 text-xs text-danger">{error}</p>}
          </div>

          <form onSubmit={submit} className="flex items-end gap-2 border-t border-line p-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder="Ask about payments, or describe an automation…"
              aria-label="Message"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink-3"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40" aria-label="Send">
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
