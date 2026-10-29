import { MARK_ACCENT } from "@/components/wordmark";

// Mason is the logo built into a robot: a white brick head with its stud on top as an
// antenna, a dark visor with two big lit eyes, and the cobalt brick as his body. Every
// mood lives in the eyes; the head lifts off the body and re-seats while he builds.

export type MasonMood = "idle" | "listening" | "building" | "done" | "offline" | "error";

const EYE_LIT = "#c3ceff";

function Eyes({ mood, tint }: { mood: MasonMood; tint: string }) {
  if (mood === "done") {
    return (
      <g fill="none" stroke={EYE_LIT} strokeWidth={1.6} strokeLinecap="round">
        <path d="M10.4 16.4q1.9-2.9 3.8 0" />
        <path d="M17.8 16.4q1.9-2.9 3.8 0" />
      </g>
    );
  }
  if (mood === "error") {
    return (
      <g fill="none" stroke={EYE_LIT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 13l3 2-3 2" />
        <path d="M21 13l-3 2 3 2" />
      </g>
    );
  }
  if (mood === "offline") {
    return (
      <g stroke="var(--ink-3)" strokeWidth={1.6} strokeLinecap="round">
        <path d="M10.6 15.2h3.6" />
        <path d="M17.8 15.2h3.6" />
      </g>
    );
  }
  // A cobalt halo behind each eye reads as glow without an SVG filter.
  return (
    <>
      {[10.3, 17.7].map((x) => (
        <g key={x} className="mason-eye">
          <rect x={x - 0.8} y={11.1} width={5.6} height={7.6} rx={2.8} fill={tint} opacity={0.5} />
          <rect x={x} y={11.9} width={4} height={6} rx={2} fill={EYE_LIT} />
          <circle cx={x + 1.25} cy={13.4} r={0.8} fill="#fff" />
        </g>
      ))}
    </>
  );
}

// The crew shares Mason's build; `tint` gives each member its own brick colour.
export function Mason({ mood = "idle", tint = MARK_ACCENT, label = "Mason", className = "" }: { mood?: MasonMood; tint?: string; label?: string; className?: string }) {
  const brick = mood === "offline" ? "var(--ink-2)" : tint;
  return (
    <svg viewBox="0 0 32 32" className={`mason ${className}`} data-mood={mood} role="img" aria-label={label}>
      <circle cx="16" cy="16" r="16" fill="var(--ink)" />
      <rect x="9" y="23.2" width="14" height="5.6" rx="2.2" fill={brick} />
      <g className="mason-head">
        <rect x="13.4" y="4.8" width="5.2" height="4.4" rx="1.6" fill={brick} />
        <rect x="5" y="7.8" width="22" height="14.2" rx="5.2" fill="#fff" />
        <rect x="7.4" y="10.2" width="17.2" height="9.4" rx="4.4" fill="var(--ink)" />
        <g className="mason-gaze">
          <g key={mood} className="mason-face">
            <Eyes mood={mood} tint={tint} />
          </g>
        </g>
      </g>
    </svg>
  );
}
