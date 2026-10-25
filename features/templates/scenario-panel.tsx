"use client";

import { nodeDefinition } from "@/lib/nodes/registry";
import type { TemplateDetailDTO } from "@/lib/workflow/dto";

const STATUS_LABEL = { would_run: "Would run", would_wait: "Would wait", would_stop: "Would stop" } as const;

// The template's example, always labelled as a dry run. Outputs are illustrative teaching
// data from the template record, never a provider response and never a stored run.
export function ScenarioPanel({ template: t }: { template: TemplateDetailDTO }) {
  const s = t.exampleScenario;
  const labelOf = (id: string) => {
    const n = t.graphDefinition.nodes.find((x) => x.id === id);
    return n?.label ?? nodeDefinition(n?.type ?? "")?.title ?? id;
  };
  return (
    <section aria-labelledby="scenario" className="rounded-2xl border border-dashed border-attention/50 bg-attention-wash/40 p-5">
      <p className="inline-flex rounded-full bg-attention-wash px-2.5 py-0.5 text-xs font-semibold text-attention">Example only — dry run</p>
      <h2 id="scenario" className="mt-3 font-display text-xl font-semibold">{s.headline}</h2>
      <p className="mt-2 text-sm text-ink-2">{s.narrative}</p>

      <ol className="mt-5 flex flex-col gap-3">
        {s.expectedStepOutputs.map((step) => (
          <li key={step.nodeId} className="rounded-xl bg-paper p-3">
            <p className="text-sm font-semibold">
              {step.label} <span className="font-normal text-ink-3">· {labelOf(step.nodeId)}</span>
            </p>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-sunken p-2.5 font-mono text-[0.6875rem] leading-relaxed text-ink-2">{JSON.stringify(step.exampleOutput, null, 2)}</pre>
          </li>
        ))}
      </ol>

      <h3 className="mt-5 text-sm font-semibold">{t.exampleRun.label}</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm">
        {t.exampleRun.steps.map((step) => (
          <li key={step.nodeId} className="flex gap-2">
            <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-3">{STATUS_LABEL[step.status]}</span>
            <span className="text-ink-2">
              <span className="font-medium text-ink">{labelOf(step.nodeId)}:</span> {step.note}
            </span>
          </li>
        ))}
      </ul>

      <ul className="mt-5 flex flex-col gap-1 text-xs text-attention">
        {s.safetyNotes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </section>
  );
}
