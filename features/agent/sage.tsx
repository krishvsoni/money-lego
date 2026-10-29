"use client";

import { useId } from "react";
import { MARK_ACCENT } from "@/components/wordmark";
import { useLookAt } from "./use-look-at";

// Sage is a small white companion robot, drawn on the page with no backdrop: a soft rounded
// head with a pale screen for a face, cobalt ears, the logo's stud as his antenna, and the
// logo's brick on his chest. His face follows the Cozmo, Loona and EVE school: two dark
// eyes that never change shape outright. Moods come from eyelids sliding over them, from the
// eyes squashing and growing, from his ears perking or drooping, and from a blush. Every
// pose is a CSS transition from the current one, so moods blend instead of snapping.

export type SageMood = "idle" | "listening" | "excited" | "sad" | "surprised" | "building" | "done" | "offline" | "error";

// A light screen with dark eyes, so every expression reads at a glance. The eyelids are
// drawn in the screen colour; they hide parts of the eye by covering them.
const SCREEN = "#eef1ff";
const EYE = "#1d2340";
const EYES = [
  { side: "l", x: 21.5 },
  { side: "r", x: 34.5 },
] as const;

// He watches the pointer only while he has nothing else to look at: not while you type
// (he reads the box) and not while building (his eyes scan the work).
const FOLLOWS: SageMood[] = ["idle", "done", "surprised"];

export function Sage({
  mood = "idle",
  tint = MARK_ACCENT,
  label = "Sage",
  follow = false,
  className = "",
}: {
  mood?: SageMood;
  tint?: string;
  label?: string;
  follow?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const { svgRef, eyesRef, headRef } = useLookAt(follow && FOLLOWS.includes(mood));
  const off = mood === "offline";
  const accent = off ? "var(--ink-3)" : tint;
  return (
    <svg ref={svgRef} viewBox="-4 -7 72 72" className={`sage ${className}`} data-mood={mood} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eceef4" />
        </linearGradient>
        <clipPath id={`${id}-screen`}>
          <rect x="15" y="14" width="34" height="22" rx="10" />
        </clipPath>
      </defs>

      <ellipse className="sage-shadow" cx="32" cy="60.5" rx="13" ry="2.2" fill="var(--ink)" opacity="0.1" />

      <g className="sage-float">
        <rect x="20" y="40" width="24" height="16" rx="8" fill={`url(#${id}-shell)`} stroke="#dcdde3" strokeWidth="0.8" />
        <rect x="26.5" y="47" width="11" height="5" rx="1.6" fill={accent} />
        <circle cx="32" cy="47" r="1.9" fill={accent} />

        <g ref={headRef}>
          <g className="sage-head">
            <rect className="sage-ear sage-ear-l" x="6.5" y="19" width="6" height="13" rx="3" fill={accent} />
            <rect className="sage-ear sage-ear-r" x="51.5" y="19" width="6" height="13" rx="3" fill={accent} />
            <g className="sage-antenna">
              <rect x="31.2" y="3.6" width="1.6" height="5" rx="0.8" fill="#d4d4d8" />
              <rect x="28.6" y="1" width="6.8" height="4.4" rx="1.8" fill={accent} />
            </g>
            <rect x="10" y="8" width="44" height="34" rx="15" fill={`url(#${id}-shell)`} stroke="#dcdde3" strokeWidth="0.8" />
            <rect x="15" y="14" width="34" height="22" rx="10" fill={SCREEN} stroke="#d9def7" strokeWidth="0.8" />

            <g clipPath={`url(#${id}-screen)`}>
              <g ref={eyesRef}>
                <g className="sage-gaze">
                  {EYES.map(({ side, x }) => (
                    <g key={side}>
                      <g className="sage-eye">
                        <rect x={x} y={19} width={8} height={12} rx={4} fill={off ? "var(--ink-3)" : EYE} />
                        {!off && <circle cx={x + 2.6} cy={22.2} r={1.5} fill="#fff" />}
                      </g>
                      <rect className={`sage-lid-top sage-lid-${side}`} x={x - 3} y={4.6} width={14} height={14.2} fill={SCREEN} />
                      <circle className="sage-lid-bottom" cx={x + 4} cy={38} r={6.6} fill={SCREEN} />
                    </g>
                  ))}
                </g>
              </g>
              <g className="sage-blush" fill="#ff8fb1">
                <ellipse cx="19.5" cy="32" rx="2.6" ry="1.4" />
                <ellipse cx="44.5" cy="32" rx="2.6" ry="1.4" />
              </g>
              <path d="M18 16.5c3-1.6 7-2.1 11-1.6" stroke="#fff" strokeOpacity="0.9" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
