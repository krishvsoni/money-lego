import { CalendarBlankIcon, GlobeIcon, type Icon } from "@phosphor-icons/react";
import { BrandLogo, isBrand } from "@/components/ui/brand-logo";
import { PROVIDERS } from "@/lib/nodes/providers";

// Generic building blocks with no brand of their own keep a glyph.
const MARK: Record<string, Icon> = { http: GlobeIcon, schedule: CalendarBlankIcon };

export function ProviderMark({ id, size = 14 }: { id: string; size?: number }) {
  if (isBrand(id)) return <BrandLogo brand={id} size={size} />;
  const Mark = MARK[id] ?? GlobeIcon;
  return <Mark size={size} weight="fill" style={{ color: PROVIDERS[id]?.color }} aria-hidden />;
}

// The services a template talks to, as named chips. Shown on cards and the detail page.
export function ProviderBadges({ ids, size = "sm" }: { ids: string[]; size?: "sm" | "md" }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Integrations">
      {ids.map((id) => (
        <li key={id} className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-paper font-medium text-ink-2 ${size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
          <ProviderMark id={id} size={size === "md" ? 16 : 13} />
          {PROVIDERS[id]?.label ?? id}
        </li>
      ))}
    </ul>
  );
}
