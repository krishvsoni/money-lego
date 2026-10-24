import type { Metadata } from "next";
import { LegalPage } from "@/features/landing/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="25 October 2026">
      <p>Money Lego is in a devnet pilot. This page says plainly what we store and why.</p>
      <h2>What we store</h2>
      <p>Your public wallet address, the workflows you build, their runs and logs, and the transfers they create. Connector secrets such as Discord or Slack webhook URLs are encrypted on our servers and never shown back to you.</p>
      <h2>What we never store</h2>
      <p>Private keys, seed phrases or anything that can sign for your wallet. Signing always happens in your wallet.</p>
      <h2>Who we share data with</h2>
      <p>MultiHopper receives the transfer details needed to quote and route a payout. Connectors you add receive the messages your workflows send them. We don&apos;t sell data or run advertising trackers.</p>
      <h2>Public by nature</h2>
      <p>Solana transactions are public. Routing spreads a transfer across hops but does not hide it.</p>
      <h2>Deleting your data</h2>
      <p>Delete credentials and archive workflows from the app at any time. For full account deletion during the pilot, contact the team that invited you.</p>
    </LegalPage>
  );
}
