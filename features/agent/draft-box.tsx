"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SparkleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { api, errorMessage, newRequestKey } from "@/lib/api-client";
import { useResource } from "@/lib/use-resource";
import type { WorkflowDTO } from "@/lib/workflow/dto";

// One sentence in, a draft workflow out. The draft opens turned off in the editor; the
// agent never moves money and every transfer still needs approval and a wallet signature.

const EXAMPLES = [
  { label: "Weekly contributor payroll", prompt: "Every Friday at 17:00 Europe/London, pay approved contributors from my Google Sheet in USDC, ask me to approve, then post the result to Slack." },
  { label: "Pay my AI agent's invoices", prompt: "When my AI agent posts a signed invoice to a webhook with invoiceId, wallet and amount, pay it once per invoice in USDC if it's under 50 USDC, after my approval, and send me a Telegram message." },
  { label: "Affiliate revenue share", prompt: "When a Stripe invoice is paid, send 20% of it in USDC to my affiliate partner's wallet after my approval, then notify Discord." },
  { label: "OTC settlement", prompt: "When my desk posts a signed webhook with a dealId, counterparty wallet and USDC amount, settle each deal once after my approval and send the receipt to my Telegram." },
];

export function DraftBox() {
  const config = useResource<{ agentReady: boolean }>("/api/config");
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(newRequestKey());

  if (!config.data?.agentReady) return null;

  const draft = async () => {
    if (busy || prompt.trim().length < 12) return;
    setBusy(true);
    setError(null);
    try {
      const { workflow } = await api<{ workflow: WorkflowDTO; notes: string[] }>("/api/agent/draft", {
        body: { prompt: prompt.trim(), requestKey: requestKey.current },
      });
      router.push(`/workflows/${workflow.id}`);
    } catch (e) {
      setError(errorMessage(e));
      requestKey.current = newRequestKey();
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <SparkleIcon size={18} weight="fill" className="text-action" aria-hidden />
        <h2 className="text-lg font-bold">Describe a payout, get a workflow</h2>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        The agent drafts it from Money Lego blocks. It opens turned off, and every transfer still waits for your approval and wallet signature.
      </p>
      <textarea
        id="agent-prompt"
        aria-label="Describe the workflow"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && void draft()}
        maxLength={1200}
        rows={3}
        disabled={busy}
        placeholder="When … happens, pay … from … after I approve, then tell …"
        className={`${inputClass} mt-4 h-auto resize-y py-2.5 leading-relaxed`}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((x) => (
          <button
            key={x.label}
            type="button"
            disabled={busy}
            onClick={() => setPrompt(x.prompt)}
            className="press rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-ink"
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">Your description is sent to an AI model. Don&apos;t include private keys or seed phrases.</p>
        <Button onClick={draft} busy={busy} disabled={prompt.trim().length < 12}>
          {busy ? "Drafting, up to a minute" : "Draft workflow"}
        </Button>
      </div>
      {error && !busy && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
