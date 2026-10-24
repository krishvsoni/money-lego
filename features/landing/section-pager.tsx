"use client";

import { useEffect } from "react";

// One wheel gesture moves exactly one section. CSS snapping alone snaps small trackpad
// moves back to where they started, so on desktop the wheel's direction decides and the
// page glides one screen. The trackpad's momentum tail is ignored until it goes quiet,
// so a single flick never skips two sections. Keyboard and touch keep native snapping.

const THRESHOLD = 24;
const DURATION = 750;
const QUIET_MS = 220;

// Matches the page's heavy ease, cubic-bezier(0.32, 0.72, 0, 1), closely enough for scrolling.
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

export function SectionPager() {
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px) and (min-height: 700px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let animating = false;
    let lastWheel = 0;
    let gestureUsed = false;
    let accumulated = 0;
    let frame = 0;

    const sections = () => Array.from(document.querySelectorAll<HTMLElement>(".snap-section")).map((s) => s.getBoundingClientRect().top + window.scrollY);

    const glideTo = (target: number) => {
      if (reduce) {
        window.scrollTo({ top: target, behavior: "instant" });
        return;
      }
      const start = window.scrollY;
      const began = performance.now();
      animating = true;
      root.style.scrollSnapType = "none";
      const tick = (now: number) => {
        const t = Math.min(1, (now - began) / DURATION);
        window.scrollTo({ top: start + (target - start) * ease(t), behavior: "instant" });
        if (t < 1) frame = requestAnimationFrame(tick);
        else {
          animating = false;
          root.style.scrollSnapType = "";
        }
      };
      frame = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      if (!desktop.matches || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel > QUIET_MS) {
        gestureUsed = false;
        accumulated = 0;
      }
      lastWheel = now;
      if (animating || gestureUsed) return;
      accumulated += e.deltaY;
      if (Math.abs(accumulated) < THRESHOLD) return;

      const tops = sections();
      const y = window.scrollY;
      const current = tops.reduce((best, top, i) => (Math.abs(top - y) < Math.abs(tops[best] - y) ? i : best), 0);
      const next = Math.max(0, Math.min(tops.length - 1, current + (accumulated > 0 ? 1 : -1)));
      gestureUsed = true;
      if (next !== current) glideTo(tops[next]);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(frame);
      root.style.scrollSnapType = "";
    };
  }, []);

  return null;
}
