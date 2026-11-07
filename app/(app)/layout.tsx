import { NetworkBadge } from "@/components/network-badge";
import { SiteNav } from "@/components/site-nav";
import { AccountControl } from "@/features/auth/account-control";
import { AuthGate } from "@/features/auth/auth-gate";

// Everything here is gated on the signed-in account, which is only known in the browser,
// so these routes opt out of instant-navigation validation (Next's documented escape
// hatch for session-gated segments) instead of prerendering an empty shell.
export const instant = false;

const APP_LINKS = [
  { href: "/workflows", label: "Workflows" },
  { href: "/templates", label: "Templates" },
  { href: "/payments", label: "Payments" },
  { href: "/shop", label: "Shop AI" },
  { href: "/connections", label: "Connections" },
];

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteNav
        wide
        links={APP_LINKS}
        right={
          <>
            <NetworkBadge />
            <AccountControl />
          </>
        }
      />
      <main id="main" className="mx-auto w-full max-w-[1080px] flex-1 px-4 pb-16 pt-28 sm:px-5 sm:pt-32">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}
