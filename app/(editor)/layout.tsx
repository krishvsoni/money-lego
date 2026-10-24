import { AuthGate } from "@/features/auth/auth-gate";

export default function EditorLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <AuthGate>{children}</AuthGate>
    </div>
  );
}
