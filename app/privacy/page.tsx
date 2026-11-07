import type { Metadata } from "next";
import { LegalPage } from "@/features/landing/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="7 November 2026">
      <p>Money Lego is a hackathon build that runs against the PayPal Sandbox. This page says plainly what we store and why.</p>
      <h2>What we store</h2>
      <p>
        Your account name (and email, if you log in with PayPal), the workflows you build, their runs and logs, and a summary of the PayPal sandbox objects they create or receive: ids, statuses, amounts and masked counterparties. Connector
        secrets such as Slack or Discord webhook URLs are encrypted on our servers and never shown back to you.
      </p>
      <h2>What we never store</h2>
      <p>PayPal passwords or your PayPal access tokens. The server&apos;s own PayPal app credentials stay in its environment and are never sent to the browser or to the AI model.</p>
      <h2>AI</h2>
      <p>AI steps receive only the data a step needs, with email addresses masked and secrets removed. AI never moves money; you approve every PayPal action.</p>
      <h2>Who we share data with</h2>
      <p>PayPal receives what each PayPal step sends it. The AI model provider receives redacted step data. Connectors you add receive the messages your workflows send them. We don&apos;t sell data or run advertising trackers.</p>
      <h2>Deleting your data</h2>
      <p>Delete credentials and archive workflows from the app at any time. Demo workspaces are disposable.</p>
    </LegalPage>
  );
}
