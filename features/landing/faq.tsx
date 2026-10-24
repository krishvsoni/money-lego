"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

// Accordion rows. The answer grows with a grid-rows transition from 0fr to 1fr, so the
// height animates without measuring, and the plus turns into a cross.
export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="tactile divide-y divide-dashed divide-line-strong rounded-2xl">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={item.q}>
            <h3>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                className="flex w-full items-center justify-between gap-6 px-6 py-6 text-left text-base font-medium text-ink [@media(max-height:860px)]:py-3"
              >
                {item.q}
                <span className="tactile-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Plus size={16} className={`fluid text-ink-2 transition-transform ${isOpen ? "rotate-45" : ""}`} aria-hidden />
                </span>
              </button>
            </h3>
            <div id={`faq-${i}`} role="region" className={`fluid grid transition-[grid-template-rows] ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <p className="max-w-[640px] px-6 pb-6 text-base text-ink-2 text-pretty [@media(max-height:860px)]:pb-4">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
