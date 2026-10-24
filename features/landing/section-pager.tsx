"use client";

import { useEffect } from "react";

// One wheel gesture moves exactly one section, and in-page links glide rather than jump.
// CSS snapping alone snaps small trackpad moves back to where they started, so on desktop
// the wheel's direction decides and the page glides one screen. The trackpad's momentum tail is ignored until it goes quiet,
// so a single flick never skips two sections. Keyboard and touch keep native snapping.

const THRESHOLD = 24;
const DURATION = 900;
const QUIET_MS = 220;

// Ease in and out: the page eases away from rest and settles gently, which reads as one
// smooth movement rather than a jump that brakes hard.
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

    // In-page links (How it works, Bricks, FAQ) glide to their section instead of jumping.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      const id = link?.getAttribute("href")?.slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const section = target.closest<HTMLElement>(".snap-section") ?? target;
      glideTo(section.getBoundingClientRect().top + window.scrollY);
      history.replaceState(null, "", `#${id}`);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("wheel", onWheel);
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
      root.style.scrollSnapType = "";
    };
  }, []);

  return null;
}
