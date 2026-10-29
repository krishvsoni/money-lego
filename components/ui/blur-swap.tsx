"use client";

import { useState } from "react";

// Swaps one short line of text for another the way Apple does: the old line softens into a
// blur and fades while the new one sharpens into place in the same spot. Both copies share
// one grid cell, so the swap never shifts the layout. Only the newest copy is read aloud.
export function BlurSwap({ text, className = "" }: { text: string; className?: string }) {
  const [shown, setShown] = useState({ current: text, previous: null as string | null, n: 0 });
  // Deriving during render (React's documented pattern for "previous value") keeps the
  // outgoing line on screen for exactly one transition, with no effect and no extra paint.
  if (shown.current !== text) setShown({ current: text, previous: shown.current, n: shown.n + 1 });

  return (
    <span className={`grid ${className}`}>
      {shown.previous !== null && (
        <span key={`out-${shown.n}`} aria-hidden className="blur-swap-out col-start-1 row-start-1">
          {shown.previous}
        </span>
      )}
      <span key={`in-${shown.n}`} className={`col-start-1 row-start-1 ${shown.n > 0 ? "blur-swap-in" : ""}`}>
        {shown.current}
      </span>
    </span>
  );
}
