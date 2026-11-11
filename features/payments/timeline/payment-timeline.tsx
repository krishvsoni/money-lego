"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api-client";
import { KIND_LABEL, MILESTONE_STATES, type Milestone, type MilestoneState, type PaymentTimeline as Timeline } from "@/lib/payments/timeline";
import { applyFilter, isFiltered, NO_FILTER, rowsFor, type GroupBy, type TimelineFilter } from "@/lib/payments/timeline-view";
import { formatMoney } from "@/lib/paypal/types";
import { useResource } from "@/lib/use-resource";
import type { TimelineAnswer } from "@/server/paypal/timeline";

// The Timeline tab on /payments: every payment's life (order, capture, refund, dispute,
// payout) next to the workflow runs that handled it, on one Bryntum time axis. Filters and the
// AI question only narrow what's shown; nothing here can move money.

const TimelineScheduler = dynamic(() => import("./timeline-scheduler").then((m) => m.TimelineScheduler), {
  ssr: false,
  loading: () => <div className="h-[600px] animate-pulse rounded-xl bg-sunken" aria-label="Loading timeline" />,
});

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

const EXAMPLE_QUESTIONS = ["Show failed captures last week", "Summarize payments stuck in pending", "Which payouts had problems?"];

export function PaymentTimeline({ onFindObject }: { onFindObject: (search: string) => void }) {
  const [days, setDays] = useState<Range>(30);
  const { data, error, loading, reload } = useResource<{ timeline: Timeline }>(`/api/payments/timeline?days=${days}`);
  const timeline = data?.timeline ?? null;

  const [groupBy, setGroupBy] = useState<GroupBy>("workflow");
  const [filter, setFilter] = useState<TimelineFilter>(NO_FILTER);
  const [answer, setAnswer] = useState<TimelineAnswer | null>(null);
  const [selected, setSelected] = useState<Milestone | null>(null);

  const shown = useMemo(() => applyFilter(timeline?.milestones ?? [], filter), [timeline, filter]);
  const rows = useMemo(() => rowsFor(shown, groupBy), [shown, groupBy]);
  const highlighted = useMemo(() => new Set(answer?.milestoneIds ?? []), [answer]);

  const toggleState = (state: MilestoneState) => setFilter((f) => ({ ...f, states: f.states.includes(state) ? f.states.filter((s) => s !== state) : [...f.states, state] }));

  const clearAll = () => {
    setFilter(NO_FILTER);
    setAnswer(null);
  };

  const applyAnswer = (a: TimelineAnswer) => {
    setAnswer(a);
    setFilter(a.filter);
  };

  const changeDays = (value: Range) => {
    setDays(value);
    setSelected(null);
  };

  // Kinds, dates and several workflows can only come from an AI answer; the controls set the rest.
  const narrowedByAi = filter.kinds.length > 0 || filter.from !== null || filter.to !== null || filter.workflowIds.length > 1;

  return (
    <section className="flex flex-col gap-4" aria-label="Payment timeline">
      <AskBox days={days} onAnswer={applyAnswer} />
      {answer && <AnswerCard answer={answer} onClear={clearAll} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[136px]">
          <Select aria-label="Period" size="sm" value={String(days)} onChange={(e) => changeDays(Number(e.target.value) as Range)}>
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r} days
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[160px]">
          <Select aria-label="Rows" size="sm" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="workflow">Row per workflow</option>
            <option value="payment">Row per payment</option>
          </Select>
        </div>
        <div className="w-[210px]">
          <Select
            aria-label="Workflow"
            size="sm"
            value={filter.workflowIds.length === 1 ? filter.workflowIds[0] : ""}
            onChange={(e) => setFilter((f) => ({ ...f, workflowIds: e.target.value ? [e.target.value] : [] }))}
          >
            <option value="">All workflows</option>
            {timeline?.workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" className="ml-auto h-8 px-3 text-xs" onClick={reload} busy={loading && Boolean(data)}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show statuses">
        {MILESTONE_STATES.map((s) => {
          const on = filter.states.length === 0 || filter.states.includes(s.state);
          return (
            <button
              key={s.state}
              type="button"
              aria-pressed={filter.states.includes(s.state)}
              onClick={() => toggleState(s.state)}
              className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${on ? "border-line-strong bg-paper text-ink" : "border-line bg-sunken text-ink-3"}`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color, opacity: on ? 1 : 0.35 }} aria-hidden />
              {s.label}
            </button>
          );
        })}
        {narrowedByAi && <span className="rounded-full bg-progress-wash px-3 py-1 text-xs font-medium text-progress">Narrowed by your question</span>}
        {isFiltered(filter) && (
          <button type="button" onClick={clearAll} className="press ml-1 text-xs font-medium text-ink-2 underline underline-offset-2 hover:text-ink">
            Show everything
          </button>
        )}
      </div>

      {error ? (
        <p role="alert" className="rounded-md bg-danger-wash px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : !timeline ? (
        <div className="h-[600px] animate-pulse rounded-xl bg-sunken" aria-label="Loading timeline" />
      ) : shown.length === 0 ? (
        <EmptyTimeline hasData={timeline.milestones.length > 0} days={days} onClear={clearAll} />
      ) : (
        <TimelineScheduler
          rows={rows}
          milestones={shown}
          groupBy={groupBy}
          from={filter.from ?? timeline.from}
          to={filter.to ?? timeline.to}
          days={days}
          highlighted={highlighted}
          onSelect={setSelected}
        />
      )}

      {selected && <MilestoneDetail milestone={selected} onClose={() => setSelected(null)} onFindObject={onFindObject} />}

      <p className="text-xs text-ink-3">
        Statuses come from PayPal&apos;s verified webhooks and the objects your workflows created; press Refresh to see the latest. A webhook PayPal sends twice still shows once. Hover a milestone for
        details, click it to open its run.
      </p>
    </section>
  );
}

function AskBox({ days, onAnswer }: { days: Range; onAnswer: (a: TimelineAnswer) => void }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (text: string) => {
    if (text.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const { answer } = await api<{ answer: TimelineAnswer }>("/api/payments/timeline/ask", { body: { question: text.trim(), days } });
      onAnswer(answer);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-progress" aria-hidden />
        <input
          aria-label="Ask about your payments"
          value={question}
          maxLength={300}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your payments, e.g. which captures failed last week?"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
        <Button type="submit" className="h-9" busy={busy} disabled={question.trim().length < 3}>
          Ask
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => {
              setQuestion(q);
              void ask(q);
            }}
            className="press rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-ink-2 hover:text-ink disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function AnswerCard({ answer, onClear }: { answer: TimelineAnswer; onClear: () => void }) {
  return (
    <div className="reveal flex gap-3 rounded-xl bg-progress-wash px-4 py-3 text-sm text-ink" role="status">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-progress" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="leading-relaxed">{answer.summary}</p>
        {answer.milestoneIds.length > 0 && (
          <p className="mt-1 text-xs text-ink-2">
            The {answer.milestoneIds.length === 1 ? "milestone it's about is" : `${answer.milestoneIds.length} milestones it's about are`} outlined on the timeline.
          </p>
        )}
      </div>
      <button type="button" onClick={onClear} aria-label="Clear the answer and its filter" className="press -m-1 h-fit rounded-full p-1 text-ink-3 hover:text-ink">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function EmptyTimeline({ hasData, days, onClear }: { hasData: boolean; days: Range; onClear: () => void }) {
  return (
    <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 text-center">
      <p className="font-semibold">{hasData ? "Nothing matches these filters" : `No payment activity in the last ${days} days`}</p>
      <p className="max-w-[48ch] text-sm text-ink-2">
        {hasData
          ? "Turn a status back on, pick all workflows, or clear the question."
          : "Pay a workflow's checkout page in the PayPal sandbox or run a template, and its order, capture and payouts show up here."}
      </p>
      {hasData && (
        <button type="button" onClick={onClear} className="press mt-1 text-sm font-medium underline underline-offset-2">
          Show everything
        </button>
      )}
    </div>
  );
}

function MilestoneDetail({ milestone: m, onClose, onFindObject }: { milestone: Milestone; onClose: () => void; onFindObject: (search: string) => void }) {
  const state = MILESTONE_STATES.find((s) => s.state === m.state);
  const facts: Array<[string, string | null]> = [
    ["Status", `${state?.label ?? m.state} (${m.status})`],
    ["Amount", m.amountMinor ? formatMoney(m.amountMinor, m.currency) : null],
    ["When", m.endAt ? `${new Date(m.at).toLocaleString()} → ${new Date(m.endAt).toLocaleString()}` : new Date(m.at).toLocaleString()],
    ["PayPal id", m.paypalId],
    ["Environment", m.environment],
    ["Workflow", m.workflowName],
    ["Recorded from", m.source === "webhook" ? "PayPal webhook" : m.source === "run" ? "Workflow run" : "PayPal object"],
    ["Why", m.reason],
  ];
  return (
    <div className="reveal rounded-xl border border-line bg-surface p-4" aria-label="Milestone details">
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: state?.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{m.label}</p>
          <p className="text-xs text-ink-3">{KIND_LABEL[m.kind]}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="press -m-1 rounded-full p-1 text-ink-3 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        {facts
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-3">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {m.workflowId && m.runId && (
          <Link href={`/workflows/${m.workflowId}?run=${m.runId}`} className="press inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-[#27272a]">
            Open the run
          </Link>
        )}
        {m.workflowId && !m.runId && (
          <Link href={`/workflows/${m.workflowId}`} className="press inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-[#27272a]">
            Open the workflow
          </Link>
        )}
        {m.paypalId && (
          <Button variant="secondary" className="h-9" onClick={() => onFindObject(m.paypalId!.replace("…", ""))}>
            Find in PayPal objects
          </Button>
        )}
      </div>
    </div>
  );
}
