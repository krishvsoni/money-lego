// The execution state machine, shared by server (enforcement) and UI (labels). Provider
// status is authoritative once a transfer exists; local states only describe the steps
// that happen before MultiHopper can see anything (quoting, wallet signing, broadcasting).

export const EXECUTION_STATES = [
  "quoting",
  "quote_unknown",
  "quoted",
  "signing",
  "funded",
  "submitted",
  "processing",
  "completed",
  "failed",
  "expired",
  "refunded",
  "needs_check",
] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export type Tone = "neutral" | "progress" | "attention" | "success" | "danger";

interface StateMeta {
  label: string;
  tone: Tone;
  terminal: boolean;
  rank: number;
  help: string;
}

export const STATE_META: Record<ExecutionState, StateMeta> = {
  quoting: { label: "Getting quote", tone: "progress", terminal: false, rank: 0, help: "Asking MultiHopper for a live quote." },
  quote_unknown: {
    label: "Needs status check",
    tone: "attention",
    terminal: false,
    rank: 0,
    help: "The quote request didn't answer in time. We'll look it up before doing anything else.",
  },
  quoted: { label: "Ready to review", tone: "neutral", terminal: false, rank: 1, help: "Review the quote, then sign with your wallet." },
  signing: { label: "Awaiting wallet signature", tone: "progress", terminal: false, rank: 2, help: "Approve the transactions in your wallet." },
  funded: { label: "Funding confirmed", tone: "progress", terminal: false, rank: 3, help: "Funding landed. Finishing route setup." },
  submitted: { label: "Submitted", tone: "progress", terminal: false, rank: 4, help: "All transactions sent. Waiting for MultiHopper to start the route." },
  processing: { label: "Processing", tone: "progress", terminal: false, rank: 5, help: "Funds are moving through the route." },
  completed: { label: "Completed", tone: "success", terminal: true, rank: 9, help: "MultiHopper reports every recipient paid." },
  failed: { label: "Failed", tone: "danger", terminal: true, rank: 8, help: "MultiHopper reports this transfer failed." },
  expired: { label: "Expired", tone: "neutral", terminal: true, rank: 8, help: "The quote expired before it was funded. No funds moved." },
  refunded: { label: "Refunded", tone: "attention", terminal: true, rank: 9, help: "The principal was returned to the source wallet." },
  needs_check: {
    label: "Needs status check",
    tone: "attention",
    terminal: false,
    rank: 6,
    help: "We couldn't confirm what happened. Recheck before trying again.",
  },
};

const ALLOWED: Record<ExecutionState, ExecutionState[]> = {
  quoting: ["quoted", "quote_unknown", "failed"],
  quote_unknown: ["quoted", "failed", "expired", "needs_check"],
  quoted: ["signing", "expired", "failed", "needs_check", "funded", "submitted", "processing"],
  signing: ["signing", "quoted", "funded", "submitted", "processing", "expired", "failed", "needs_check"],
  funded: ["signing", "funded", "submitted", "processing", "failed", "needs_check", "expired"],
  submitted: ["signing", "submitted", "processing", "completed", "failed", "needs_check", "refunded"],
  processing: ["processing", "completed", "failed", "refunded", "needs_check"],
  needs_check: ["quoted", "signing", "funded", "submitted", "processing", "completed", "failed", "expired", "refunded", "needs_check"],
  completed: [],
  failed: ["refunded"],
  expired: [],
  refunded: [],
};

export function canTransition(from: ExecutionState, to: ExecutionState): boolean {
  return ALLOWED[from].includes(to);
}

export function isTerminal(state: ExecutionState): boolean {
  return STATE_META[state].terminal;
}

const PROVIDER_STATUS_MAP: Record<string, ExecutionState> = {
  processing: "processing",
  active: "processing",
  completed: "completed",
  failed: "failed",
  expired: "expired",
  refunded: "refunded",
};

// Maps a raw provider status onto our state without letting a stale or out-of-order
// report move an execution backwards. `quote` and `awaiting_signature` only tell us the
// provider hasn't started yet, so the local step stays as it is.
export function reconcileState(current: ExecutionState, providerStatus: string): ExecutionState {
  if (providerStatus === "quote" || providerStatus === "awaiting_signature") {
    return current === "quote_unknown" || current === "needs_check" ? "quoted" : current;
  }
  const mapped = PROVIDER_STATUS_MAP[providerStatus] ?? "needs_check";
  if (mapped === current) return current;
  if (mapped === "needs_check" && isTerminal(current)) return current;
  if (!canTransition(current, mapped)) return current;
  if (!isTerminal(mapped) && STATE_META[mapped].rank < STATE_META[current].rank && current !== "needs_check") {
    return current;
  }
  return mapped;
}

export const ACTIVE_STATES: ExecutionState[] = EXECUTION_STATES.filter((s) => !STATE_META[s].terminal);
