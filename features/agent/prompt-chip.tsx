"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react";

// A suggested prompt as a small white keycap: it lifts off the page on hover while an arrow
// slides in at its edge, and sinks into the page when pressed. The arrow's space is always
// reserved, so nothing around the chip moves. `compact` is a pill sized to its words, for
// tight panels where several wrap onto a line; it keeps the lift and press but drops the arrow.
export function PromptChip({ label, tint, onClick, disabled, compact = false }: { label: string; tint?: string; onClick: () => void; disabled?: boolean; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`prompt-chip group ${compact ? "prompt-chip-compact" : ""}`}>
      {tint && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tint }} />}
      <span className="min-w-0 leading-snug text-balance">{label}</span>
      {!compact && <ArrowUpRightIcon aria-hidden size={12} weight="bold" className="prompt-chip-arrow" />}
    </button>
  );
}
