import { AuthGate } from "@/features/auth/auth-gate";

// Everything here is gated on the signed-in account, which is only known in the browser,
// so these routes opt out of instant-navigation validation (Next's documented escape
// hatch for session-gated segments) instead of prerendering an empty shell.
export const instant = false;

export default function EditorLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <AuthGate>{children}</AuthGate>
    </div>
  );
}
