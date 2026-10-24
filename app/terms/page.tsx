import type { Metadata } from "next";
import { LegalPage } from "@/features/landing/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="25 October 2026">
      <p>These pilot terms are short on purpose. If anything here is unclear, ask before you send funds.</p>
      <h2>What Money Lego does</h2>
      <p>Money Lego lets you build workflows that prepare token transfers routed by MultiHopper. You approve and sign every transfer from your own wallet. We do not hold your funds.</p>
      <h2>Your responsibilities</h2>
      <p>Check recipient addresses and amounts before you sign. On-chain transfers can&apos;t be reversed by us or by MultiHopper once funded.</p>
      <h2>Fees</h2>
      <p>MultiHopper fees and Solana network costs are shown in each quote before you sign. Money Lego is free during the devnet pilot.</p>
      <h2>Availability</h2>
      <p>The pilot runs on devnet and may change or pause. Do not use it for funds you can&apos;t afford to have delayed.</p>
      <h2>No advice</h2>
      <p>Nothing here is legal, tax or financial advice.</p>
    </LegalPage>
  );
}
