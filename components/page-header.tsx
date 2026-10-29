import type { ReactNode } from "react";

// The one page header every app page uses, so titles share a size, a baseline and a left
// edge that lines up with the logo in the nav. Actions sit on the title's baseline.
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="headline text-4xl tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-2 max-w-[62ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
