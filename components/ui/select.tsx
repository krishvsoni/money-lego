import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { inputClass } from "./field";

// Tailwind UI's select: the native element keeps keyboard, screen-reader and mobile pickers,
// with its own arrow hidden (appearance-none) and our chevron laid over it in the same grid
// cell, inset from the edge, so every dropdown looks the same in every browser.
export function Select({
  className = "",
  wrapperClassName = "",
  size = "md",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { wrapperClassName?: string; size?: "sm" | "md" }) {
  const small = size === "sm";
  return (
    <div className={`grid w-full min-w-0 grid-cols-1 ${wrapperClassName}`}>
      <select {...props} className={`${inputClass} col-start-1 row-start-1 cursor-pointer appearance-none truncate ${small ? "h-8 pl-2.5 pr-7 text-xs" : "pr-9"} ${className}`} />
      <ChevronDown
        aria-hidden
        strokeWidth={2}
        className={`pointer-events-none col-start-1 row-start-1 self-center justify-self-end text-ink-3 ${small ? "mr-2 h-3.5 w-3.5" : "mr-3 h-4 w-4"}`}
      />
    </div>
  );
}
