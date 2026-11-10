import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-[border-color] duration-150 hover:border-ink-3 focus:border-action focus:outline-none aria-[invalid=true]:border-danger";

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: ReactNode; error?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input {...props} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${props.id}-error` : undefined} className={`${inputClass} ${props.className ?? ""}`} />;
}
