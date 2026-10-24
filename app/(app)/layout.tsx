import Link from "next/link";
import { NetworkBadge } from "@/components/network-badge";
import { Wordmark } from "@/components/wordmark";
import { AccountControl } from "@/features/auth/account-control";
import { AuthGate } from "@/features/auth/auth-gate";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-5">
            <Wordmark href="/dashboard" />
            <nav className="hidden sm:block">
              <Link href="/dashboard" className="text-sm font-semibold text-ink-2 hover:text-ink">
                Recipes and runs
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NetworkBadge />
            <AccountControl />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}
