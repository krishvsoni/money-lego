"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrickGlyph } from "@/components/wordmark";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#bricks", label: "Bricks" },
  { href: "#faq", label: "FAQ" },
];

// A floating glass pill. On small screens the hamburger lines rotate into an X and the
// menu opens as a full-screen glass sheet with links rising in one at a time.
export function IslandNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
        <div className="mx-auto mt-6 flex w-max items-center gap-2 rounded-full border border-line bg-white/75 p-1 pl-4 shadow-[0_8px_24px_-12px_rgb(9_9_11/0.18)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2 rounded-full pr-2 font-display text-xl font-semibold tracking-[-0.025em] text-ink" aria-current="page">
            <BrickGlyph className="h-3.5 w-6" />
            Money Lego
          </Link>
          <ul className="hidden items-center sm:flex">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="fluid rounded-full px-3 py-2 text-base text-ink-2 transition-colors hover:bg-sunken hover:text-ink">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/workflows"
            className="press hidden rounded-full bg-ink px-4 py-2 text-base font-medium text-white hover:bg-[#27272a] sm:inline-flex"
          >
            Open builder
          </Link>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="press relative h-10 w-10 rounded-full hover:bg-sunken sm:hidden"
          >
            <span className={`fluid absolute left-3 top-1/2 h-0.5 w-4 rounded-full bg-ink transition-transform ${open ? "rotate-45" : "-translate-y-1"}`} />
            <span className={`fluid absolute left-3 top-1/2 h-0.5 w-4 rounded-full bg-ink transition-transform ${open ? "-rotate-45" : "translate-y-1"}`} />
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        className={`fluid fixed inset-0 z-30 bg-white/80 backdrop-blur-3xl transition-opacity sm:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!open}
      >
        <ul className="flex h-full flex-col justify-center gap-6 px-8">
          {[...LINKS, { href: "/workflows", label: "Open builder" }].map((l, i) => (
            <li key={l.href} className="overflow-hidden">
              <a
                href={l.href}
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className={`fluid block text-4xl font-medium tracking-tight text-ink transition-[transform,opacity] ${open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
                style={{ transitionDelay: open ? `${100 + i * 50}ms` : "0ms" }}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
