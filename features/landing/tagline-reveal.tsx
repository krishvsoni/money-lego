"use client";

import { useEffect, useRef } from "react";

// Each word starts muted and turns to full ink as it crosses a line 40% up the viewport,
// one word at a time in reading order. One observer watches every word.
export function TaglineReveal({ lines, center = false }: { lines: string[]; center?: boolean }) {
  const root = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const words = Array.from(root.current?.querySelectorAll<HTMLSpanElement>("[data-word]") ?? []);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      words.forEach((w) => (w.dataset.on = "true"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.target as HTMLElement).dataset.on = String(e.isIntersecting || e.boundingClientRect.top < 0);
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    words.forEach((w) => io.observe(w));
    return () => io.disconnect();
  }, []);

  return (
    <p ref={root} className={`max-w-[680px] text-4xl font-medium tracking-tight text-balance sm:text-5xl ${center ? "mx-auto text-center" : ""}`}>
      {lines.map((line, li) => (
        <span key={li} className="block">
          {line.split(" ").map((word, wi) => {
            return (
              <span
                key={`${li}-${wi}`}
                data-word
                data-on="false"
                className="text-ink transition-[color] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] data-[on=false]:text-ink/25"
              >
                {word}{" "}
              </span>
            );
          })}
        </span>
      ))}
    </p>
  );
}
