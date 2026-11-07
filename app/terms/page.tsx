import type { Metadata } from "next";
import { LegalPage } from "@/features/landing/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="7 November 2026">
      <p>These terms are short on purpose.</p>
      <h2>What Money Lego does</h2>
      <p>Money Lego lets you build workflows that read from and act on PayPal through PayPal&apos;s APIs. Every payout, refund or invoice send waits for your explicit approval. We do not hold funds; PayPal does.</p>
      <h2>Sandbox only</h2>
      <p>This build runs against the PayPal Sandbox with test accounts and test money. Do not enter real payment credentials.</p>
      <h2>Your responsibilities</h2>
      <p>Check recipients and amounts before you approve. AI suggestions and reviews can be wrong; your approval is the decision.</p>
      <h2>No advice</h2>
      <p>Nothing here is legal, tax or financial advice.</p>
    </LegalPage>
  );
}
