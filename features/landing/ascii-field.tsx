"use client";

import { useEffect, useRef } from "react";
import { GLYPHS, HOPS, RECIPIENTS, RouteSim, SOURCE } from "./route-sim";

// Light-theme pigments, as RGB, for cells tinted by the recipient they flow toward.
const TINTS: Array<[number, number, number]> = [
  [44, 75, 214],
  [227, 162, 26],
  [194, 65, 45],
  [122, 62, 143],
];

const CELL = 15;

export function AsciiField() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mono = getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace";
    const sim = new RouteSim();
    let dashes: Array<[number, number]> = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = el.clientWidth;
      height = el.clientHeight;
      el.width = Math.floor(width * dpr);
      el.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sim.resize(Math.ceil(width / CELL), Math.ceil(height / CELL));
      dashes = Array.from({ length: Math.floor((sim.cols * sim.rows) / 60) }, (_, i) => [((i * 7919) % sim.cols) * CELL, ((i * 104729) % sim.rows) * CELL]);
      sim.warm(reduce ? 16 : 10);
    };

    // The content column (headline, card, button, proof line) is a calm zone: cells inside it fade to a
    // whisper, with a soft 64px edge. On phones the column is the whole width, so the field
    // stays faint everywhere and the copy always reads first.
    const quiet = (x: number, y: number) => {
      const half = Math.min(420, width / 2 - 16);
      const dx = Math.max(0, Math.abs(x - width / 2) - half);
      const dy = Math.max(0, Math.max(height * 0.12 - y, y - height * 0.97));
      const edge = Math.min(1, Math.hypot(dx, dy) / 64);
      const floor = width < 640 ? 0.12 : 0.05;
      return floor + (1 - floor) * edge * edge;
    };
    const inContent = (x: number, y: number) => Math.abs(x - width / 2) < Math.min(440, width / 2) && y > height * 0.1 && y < height * 0.98;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(212, 212, 216, 0.9)";
      for (const [x, y] of dashes) ctx.fillRect(x + 4, y + CELL / 2, 6, 1);

      ctx.font = `500 ${Math.round(CELL * 0.68)}px ${mono}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let row = 0; row < sim.rows; row++) {
        for (let col = 0; col < sim.cols; col++) {
          const i = row * sim.cols + col;
          const h = sim.heat[i];
          if (h < 0.06) continue;
          const x = col * CELL;
          const y = row * CELL;
          const q = quiet(x, y);
          const a = Math.min(1, h) * q;
          const tint = sim.tint[i];
          if (tint >= 0 && h > 0.35) {
            const [r, g, b] = TINTS[tint];
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.32 * a})`;
          } else {
            ctx.fillStyle = `rgba(113, 113, 122, ${0.2 * a + (h > 0.9 ? 0.18 * q : 0)})`;
          }
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          if (h > 0.2) {
            ctx.fillStyle = `rgba(39, 39, 42, ${0.75 * a})`;
            ctx.fillText(GLYPHS[sim.glyph[i]], x + CELL / 2, y + CELL / 2 + 0.5);
          }
        }
      }

      if (width >= 768) {
        ctx.font = `400 11px ${mono}`;
        ctx.textAlign = "left";
        // Labels get a white backing so a passing trail never makes them unreadable.
        const label = (text: string, x: number, y: number) => {
          if (inContent(x, y)) return;
          const w = ctx.measureText(text).width;
          const left = ctx.textAlign === "right" ? x - w : x;
          ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
          ctx.fillRect(left - 4, y - 8, w + 8, 16);
          ctx.fillStyle = "rgba(82, 82, 91, 1)";
          ctx.fillText(text, x, y);
        };
        label("PayPal checkout", SOURCE.x * width + 28, SOURCE.y * height + 2);
        HOPS.forEach((h) => label(h.label, h.x * width + 28, h.y * height + 2));
        ctx.textAlign = "right";
        RECIPIENTS.forEach((r) => label(r.label, r.at.x * width - 32, r.at.y * height + 2));
      }
    };

    resize();
    draw();
    if (reduce) {
      const onResize = () => (resize(), draw());
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    let frame = 0;
    let last = performance.now();
    let visible = true;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.step(dt);
      draw();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (frame || !visible || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(el);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    const ro = new ResizeObserver(() => (resize(), draw()));
    ro.observe(el);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden />;
}
