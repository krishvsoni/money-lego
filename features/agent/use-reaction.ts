"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// How Sage reacts to the text box. Typing excites him, deleting saddens him, and clearing
// it all surprises him. Excited and sad fade back to plain listening after a short pause;
// surprise holds until you type again, and leaving the box resets him to normal.

export type Reaction = "excited" | "sad" | "surprised";

const SETTLE_MS = 1_100;

export function useReaction() {
  const [focused, setFocused] = useState(false);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const react = useCallback((before: string, after: string) => {
    clear();
    const next: Reaction = after.length > before.length ? "excited" : after.trim().length === 0 ? "surprised" : "sad";
    setReaction(next);
    if (next !== "surprised") timer.current = setTimeout(() => setReaction(null), SETTLE_MS);
  }, []);

  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => {
    clear();
    setFocused(false);
    setReaction(null);
  }, []);

  return { focused, reaction, react, focus, blur };
}
