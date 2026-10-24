"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";

// Accordion rows. The answer grows with a grid-rows transition from 0fr to 1fr, so the
// height animates without measuring, and the plus turns into a cross.
export function Faq({ items }: { items: Array<{ q: string; a: string }> }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={item.q}>
            <h3>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                className="flex w-full items-center justify-between gap-6 px-6 py-6 text-left text-base font-medium text-ink"
              >
                {item.q}
                <Plus size={18} className={`fluid shrink-0 text-ink-2 transition-transform ${isOpen ? "rotate-45" : ""}`} aria-hidden />
              </button>
            </h3>
            <div id={`faq-${i}`} role="region" className={`fluid grid transition-[grid-template-rows] ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <p className="max-w-[640px] px-6 pb-6 text-base text-ink-2 text-pretty">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
