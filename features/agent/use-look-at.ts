"use client";

import { useEffect, useRef } from "react";

// Sage's eyes follow the pointer anywhere on the page, and his head leans a little toward
// it. The target is read on pointer move; a single animation-frame loop eases the eyes
// toward it (a critically damped follow, so they glide and never overshoot) and stops once
// they settle. Transforms are written straight to the two SVG groups: no React state, no
// re-render, nothing else on the page restyles. Off for reduced motion and touch-only
// screens, and whenever `active` is false (typing, building), when the eyes ease home.

const MAX_X = 2.6;
const MAX_Y = 1.8;
const MAX_TILT = 4;
const FOLLOW = 0.16;

export function useLookAt(active: boolean) {
  const svg = useRef<SVGSVGElement | null>(null);
  const eyes = useRef<SVGGElement | null>(null);
  const head = useRef<SVGGElement | null>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const enabled = useRef(false);

  useEffect(() => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    enabled.current = finePointer && !reduced;
    if (!enabled.current) return;
    // Following replaces the idle glance; touch screens keep the glance instead.
    svg.current?.setAttribute("data-follow", "");

    const paint = () => {
      const c = current.current;
      const t = active ? target.current : { x: 0, y: 0 };
      c.x += (t.x - c.x) * FOLLOW;
      c.y += (t.y - c.y) * FOLLOW;
      eyes.current?.setAttribute("transform", `translate(${(c.x * MAX_X).toFixed(3)} ${(c.y * MAX_Y).toFixed(3)})`);
      head.current?.setAttribute("transform", `rotate(${(c.x * MAX_TILT).toFixed(3)} 32 40)`);
      const settled = Math.abs(t.x - c.x) < 0.002 && Math.abs(t.y - c.y) < 0.002;
      frame.current = settled ? null : requestAnimationFrame(paint);
    };
    const wake = () => {
      if (frame.current === null) frame.current = requestAnimationFrame(paint);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !svg.current) return;
      const box = svg.current.getBoundingClientRect();
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height * 0.4);
      // Saturates about 400px away, so he looks fully toward anything across the page.
      target.current = { x: Math.max(-1, Math.min(1, dx / 400)), y: Math.max(-1, Math.min(1, dy / 400)) };
      if (active) wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    wake();
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [active]);

  return { svgRef: svg, eyesRef: eyes, headRef: head };
}
