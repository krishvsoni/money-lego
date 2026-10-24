"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

// A heavy fade up as the element enters the viewport, once. Rendered visible on the
// server, then hidden only if it starts below the fold, so nothing is lost without JS.
export function Reveal({ children, as: Tag = "div", className = "", delay = 0 }: { children: ReactNode; as?: ElementType; className?: string; delay?: number }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        } else if (entry.boundingClientRect.top > 0) {
          setShown(false);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} data-shown={shown} className={`scroll-reveal ${className}`} style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}>
      {children}
    </Tag>
  );
}
