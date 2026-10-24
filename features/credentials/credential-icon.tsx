import type { CredentialType } from "@/lib/nodes/types";
import { CREDENTIAL_META } from "./credential-types";

// The type's mark on a soft keycap, used by the picker, the form header and the list.
export function CredentialIcon({ type, size = "md" }: { type: CredentialType; size?: "sm" | "md" }) {
  const { icon: Glyph, color } = CREDENTIAL_META[type];
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : "h-10 w-10 rounded-xl";
  return (
    <span className={`tactile-soft flex shrink-0 items-center justify-center ${box}`} style={{ color }} aria-hidden>
      <Glyph size={size === "sm" ? 18 : 20} weight="fill" />
    </span>
  );
}
