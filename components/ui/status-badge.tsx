import { STATE_META, type ExecutionState, type Tone } from "@/lib/execution-states";

const TONE: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  progress: "bg-progress-wash text-action",
  attention: "bg-attention-wash text-attention",
  success: "bg-success-wash text-success",
  danger: "bg-danger-wash text-danger",
};

export function StatusBadge({ state }: { state: ExecutionState }) {
  const meta = STATE_META[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[meta.tone]}`}>
      {meta.tone === "progress" && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {meta.label}
    </span>
  );
}
