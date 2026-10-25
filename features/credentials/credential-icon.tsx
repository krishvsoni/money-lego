import { BrandLogo } from "@/components/ui/brand-logo";
import type { CredentialType } from "@/lib/nodes/types";
import { CREDENTIAL_META } from "./credential-types";

// The service's real logo on a white keycap (or our glyph for user-owned secrets), used by
// the picker, the form header, the saved list and the Connections page.
export function CredentialIcon({ type, size = "md" }: { type: CredentialType; size?: "sm" | "md" }) {
  const { icon: Glyph, color, brand } = CREDENTIAL_META[type];
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : "h-10 w-10 rounded-xl";
  if (brand) {
    return (
      <span className={`flex shrink-0 items-center justify-center border border-line bg-white shadow-[0_1px_2px_rgb(9_9_11/0.06)] ${box}`} aria-hidden>
        <BrandLogo brand={brand} size={size === "sm" ? 20 : 22} />
      </span>
    );
  }
  return (
    <span className={`tactile-soft flex shrink-0 items-center justify-center ${box}`} style={{ color }} aria-hidden>
      <Glyph size={size === "sm" ? 18 : 20} weight="fill" />
    </span>
  );
}
