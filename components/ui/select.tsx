"use client";

import { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown } from "lucide-react";

// Tailwind UI's custom select menu, in place of the browser's native popup. Call sites keep
// writing <option> children and reading e.target.value, so swapping it in changed nothing
// for them. The list renders in a portal at fixed position, so a scrolling sidebar can't
// clip it, opens from the trigger (flipping up when there's no room below), and follows the
// listbox pattern: arrows, Home/End, Enter or Space to pick, Escape to close, type to jump.

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };

const textOf = (node: ReactNode): string =>
  Children.toArray(node)
    .map((n) => (typeof n === "string" || typeof n === "number" ? String(n) : isValidElement<{ children?: ReactNode }>(n) ? textOf(n.props.children) : ""))
    .join("");

function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children)
    .filter((c): c is ReactElement<OptionProps> => isValidElement(c) && c.type === "option")
    .map((c) => ({ value: String(c.props.value ?? ""), label: textOf(c.props.children), disabled: Boolean(c.props.disabled) }));
}

const MAX_LIST = 240;

export function Select({
  id,
  value,
  onChange,
  children,
  disabled,
  size = "md",
  className = "",
  wrapperClassName = "",
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  wrapperClassName?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const options = readOptions(children);
  const selected = options.find((o) => o.value === value) ?? options[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ top?: number; bottom?: number; left: number; width: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const small = size === "sm";

  const measure = useCallback(() => {
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    const up = window.innerHeight - box.bottom < MAX_LIST + 12 && box.top > window.innerHeight - box.bottom;
    setPlace(up ? { bottom: window.innerHeight - box.top + 6, left: box.left, width: box.width, up } : { top: box.bottom + 6, left: box.left, width: box.width, up });
  }, []);

  const show = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === selected?.value)));
    measure();
    setOpen(true);
  };

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange({ target: { value: o.value } });
    close(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Follow the trigger while the page or a panel scrolls; close on any press outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure, close]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((a) => step(a, 1));
    else if (e.key === "ArrowUp") setActive((a) => step(a, -1));
    else if (e.key === "Home") setActive(step(-1, 1));
    else if (e.key === "End") setActive(step(options.length, -1));
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") close(false);
    else if (e.key.length === 1) {
      const now = e.timeStamp;
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className={`w-full min-w-0 ${wrapperClassName}`}>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        // A button can't be aria-invalid; the invalid look comes from data-invalid and the
        // reason is read out from the field's error line, as text inputs do.
        data-invalid={ariaInvalid || undefined}
        aria-describedby={ariaInvalid && id ? `${id}-error` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : show())}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
        className={`flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface text-left text-ink transition-[border-color] duration-150 hover:border-ink-3 focus:border-action focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[invalid=true]:border-danger ${small ? "h-8 px-2.5 text-xs" : "h-10 px-3 text-sm"} ${className}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected?.value === "" ? "text-ink-3" : ""}`}>{selected?.label ?? ""}</span>
        <ChevronsUpDown aria-hidden strokeWidth={2} className={`shrink-0 text-ink-3 ${small ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={`${listId}-${active}`}
            onKeyDown={onListKey}
            style={{ top: place.top, bottom: place.bottom, left: place.left, minWidth: place.width, maxHeight: MAX_LIST }}
            className={`select-pop fixed z-[100] max-w-[min(420px,calc(100vw-24px))] overflow-y-auto rounded-xl bg-paper p-1 text-sm shadow-[0_0_0_1px_var(--line),0_12px_32px_-12px_rgb(9_9_11/0.28)] focus:outline-none ${place.up ? "origin-bottom" : "origin-top"}`}
          >
            {options.map((o, i) => {
              const isSelected = o.value === selected?.value;
              return (
                <li
                  key={`${o.value}-${i}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  onPointerMove={() => !o.disabled && i !== active && setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-2 pl-2.5 ${i === active ? "bg-sunken" : ""} ${o.disabled ? "cursor-not-allowed opacity-40" : ""} ${isSelected ? "font-semibold" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {isSelected && <Check aria-hidden strokeWidth={2.5} className="h-4 w-4 shrink-0 text-ink" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
