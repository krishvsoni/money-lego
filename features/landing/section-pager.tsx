"use client";

import { useEffect } from "react";

// One swipe moves exactly one section, and in-page links glide rather than jump.
//
// A trackpad keeps sending wheel events for about a second after the fingers lift
// (momentum). Those events only ever decay, while a new swipe makes the delta jump back
// up, so a rebound out of a decaying tail is treated as a fresh swipe even mid-momentum.
// A swipe that arrives while a glide is running is queued, so two quick swipes move two
// sections. Keyboard and touch keep native snapping.

const THRESHOLD = 12;
const DURATION = 1100;
const REBOUND_RATIO = 2.2;
const QUIET_MS = 140;
const REFRACTORY_MS = 300;

// A slow ease out: the page responds on the first frame, then takes its time to settle,
// so the move reads as one calm glide rather than a jump.
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function SectionPager() {
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px) and (min-height: 700px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let animating = false;
    let frame = 0;
    let target = 0;
    let queued = 0;
    let lastWheel = 0;
    let gestureUsed = false;
    let lastTrigger = 0;
    // Shape of the current gesture: its peak, and once it has fallen below half that peak
    // (the momentum tail), the lowest point reached since.
    let peak = 0;
    let trough = Infinity;
    let inTail = false;

    const sections = () => Array.from(document.querySelectorAll<HTMLElement>(".snap-section")).map((s) => s.getBoundingClientRect().top + window.scrollY);

    const indexOf = (y: number, tops: number[]) => tops.reduce((best, top, i) => (Math.abs(top - y) < Math.abs(tops[best] - y) ? i : best), 0);

    const glideTo = (to: number) => {
      target = to;
      if (reduce) {
        window.scrollTo({ top: to, behavior: "instant" });
        return;
      }
      cancelAnimationFrame(frame);
      const from = window.scrollY;
      const began = performance.now();
      animating = true;
      root.style.scrollSnapType = "none";
      const tick = (now: number) => {
        const t = Math.min(1, (now - began) / DURATION);
        window.scrollTo({ top: from + (to - from) * ease(t), behavior: "instant" });
        if (t < 1) {
          frame = requestAnimationFrame(tick);
          return;
        }
        animating = false;
        root.style.scrollSnapType = "";
        if (queued) {
          const direction = queued;
          queued = 0;
          step(direction);
        }
      };
      frame = requestAnimationFrame(tick);
    };

    const step = (direction: number) => {
      const tops = sections();
      const from = animating ? target : window.scrollY;
      const current = indexOf(from, tops);
      const next = Math.max(0, Math.min(tops.length - 1, current + direction));
      if (next !== current) glideTo(tops[next]);
    };

    const onWheel = (e: WheelEvent) => {
      if (!desktop.matches || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = performance.now();
      const size = Math.abs(e.deltaY);
      const quiet = now - lastWheel > QUIET_MS;
      lastWheel = now;
      if (quiet) {
        peak = 0;
        trough = Infinity;
        inTail = false;
      }
      peak = Math.max(peak, size);
      if (!inTail && size < peak * 0.5) inTail = true;
      if (inTail) trough = Math.min(trough, size);
      // A swipe ramps up and then decays. Once it's in its tail, a rebound well above the
      // lowest point means the fingers came back down: that's a new swipe.
      const rebound = inTail && size >= trough * REBOUND_RATIO && size > THRESHOLD && now - lastTrigger > REFRACTORY_MS;
      if (quiet || rebound) {
        gestureUsed = false;
        if (rebound) {
          peak = size;
          trough = Infinity;
          inTail = false;
        }
      }
      if (gestureUsed || size < THRESHOLD) return;

      gestureUsed = true;
      lastTrigger = now;
      const direction = e.deltaY > 0 ? 1 : -1;
      if (animating) {
        queued = direction;
        return;
      }
      step(direction);
    };

    // In-page links (logo, How it works, Bricks, FAQ) glide instead of jumping.
    const onClick = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      // The logo links to "/", the page we're already on: glide back to the top instead.
      const home = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href="/"]');
      if (home) {
        e.preventDefault();
        glideTo(0);
        history.replaceState(null, "", "/");
        return;
      }
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      const id = link?.getAttribute("href")?.slice(1);
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      e.preventDefault();
      const section = el.closest<HTMLElement>(".snap-section") ?? el;
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
