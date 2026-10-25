"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { BrickGlyph } from "./wordmark";

export interface NavLink {
  href: string;
  label: string;
}

// The one navbar for the whole site: a floating glass bar with a fixed width on every page.
// Three columns: brand left, links centred, and a right-hand slot (a CTA on marketing pages,
// network and wallet in the app) pinned right, so new items never resize or shift the bar.
// The current page is marked. On small screens the hamburger rotates into an X and the links rise into
// a full-screen glass sheet one at a time.
export function SiteNav({ links, right, mobileExtra, homeHref = "/" }: { links: NavLink[]; right: ReactNode; mobileExtra?: NavLink; homeHref?: string }) {
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

  const sheet = mobileExtra ? [...links, mobileExtra] : links;

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
        <div className="mx-auto mt-5 flex h-14 w-full max-w-[1080px] items-center justify-between gap-2 rounded-full border border-line bg-white/80 py-1.5 pl-5 pr-2 shadow-[0_8px_24px_-12px_rgb(9_9_11/0.18)] backdrop-blur-xl sm:grid sm:grid-cols-[1fr_auto_1fr]">
          <Link href={homeHref} className="flex items-center gap-2 justify-self-start whitespace-nowrap rounded-full font-display text-lg font-semibold tracking-[-0.025em] text-ink">
            <BrickGlyph className="h-3 w-5" />
            Money Lego
          </Link>
          <Suspense fallback={<DesktopLinks links={links} pathname={null} />}>
            <CurrentDesktopLinks links={links} />
          </Suspense>
          <div className="hidden min-w-0 items-center justify-end gap-2 justify-self-end sm:flex">{right}</div>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="press relative h-9 w-9 rounded-full hover:bg-sunken sm:hidden"
          >
            <span className={`fluid absolute left-2.5 top-1/2 h-0.5 w-4 rounded-full bg-ink transition-transform ${open ? "rotate-45" : "-translate-y-1"}`} />
            <span className={`fluid absolute left-2.5 top-1/2 h-0.5 w-4 rounded-full bg-ink transition-transform ${open ? "-rotate-45" : "translate-y-1"}`} />
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        className={`fluid fixed inset-0 z-30 bg-white/80 backdrop-blur-3xl transition-opacity sm:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col justify-center gap-10 px-8">
          <ul className="flex flex-col gap-6">
            {sheet.map((l, i) => (
              <li key={l.href} className="overflow-hidden">
                <Link
                  href={l.href}
                  tabIndex={open ? 0 : -1}
                  onClick={() => setOpen(false)}
                  className={`fluid block font-display text-4xl font-semibold tracking-tight text-ink transition-[transform,opacity] ${open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
                  style={{ transitionDelay: open ? `${100 + i * 50}ms` : "0ms" }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className={`fluid transition-opacity ${open ? "opacity-100" : "opacity-0"}`}>{right}</div>
        </div>
      </div>
    </>
  );
}

// The pathname is read in its own boundary: on dynamic routes it suspends during prerender,
// and the pill shouldn't wait for it. The fallback is the same links, just unmarked.
function CurrentDesktopLinks({ links }: { links: NavLink[] }) {
  return <DesktopLinks links={links} pathname={usePathname()} />;
}

function DesktopLinks({ links, pathname }: { links: NavLink[]; pathname: string | null }) {
  const isCurrent = (href: string) => pathname !== null && !href.startsWith("#") && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <ul className="hidden items-center gap-2 sm:flex">
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={isCurrent(l.href) ? "page" : undefined}
            className="fluid rounded-full px-4 py-1.5 text-[15px] text-ink-2 transition-colors hover:bg-sunken hover:text-ink aria-[current=page]:bg-sunken aria-[current=page]:text-ink"
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NavCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="press inline-flex h-9 items-center rounded-full bg-ink px-4 text-[15px] font-medium text-white hover:bg-[#27272a]">
      {children}
    </Link>
  );
}
