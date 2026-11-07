import { MAIN_IN, MAIN_OUT, type NodeDefinition } from "../types";

// Bounded AI steps. The model reads the run's data (with emails masked) and returns a
// small, schema-checked JSON answer. It never calls PayPal, never picks a recipient and
// never decides whether money moves: a Human approval and deterministic nodes do that.

export const aiNodes: NodeDefinition[] = [
  {
    type: "ai.review",
    summary: "AI checks the payment for risks before you approve.",
    title: "AI risk review",
    category: "ai",
    description:
      "Combine deterministic checks (totals reconcile, currency matches, recipients are valid, amount within your limit) with an AI read of the data for anything unusual. The result is shown to the approver. High risk can take its own branch.",
    icon: "Sparkles",
    fields: [
      { key: "maxAmount", label: "Flag above", kind: "text", placeholder: "500.00", help: "Optional. Amounts above this are flagged as high risk." },
      { key: "guidance", label: "What to watch for", kind: "textarea", maxLength: 600, placeholder: "New recipients, amounts unusual for this client, weekend payments…" },
    ],
    inputs: MAIN_IN,
    outputs: [
      { id: "main", label: "OK to review" },
      { id: "high", label: "High risk" },
    ],
    defaults: { maxAmount: "", guidance: "" },
    retrySafe: true,
    outputHint: "The input plus { review: { risk: low|medium|high, summary, flags: [..], checks: [{ name, ok, detail }], model } }.",
  },
  {
    type: "ai.write",
    summary: "AI drafts a message from the run's data.",
    title: "AI write",
    category: "ai",
    description:
      "Draft text from the run's data: one message, or one per item of a list (for example a polite reminder per overdue invoice). Drafts are plain text for a human to review; facts such as amounts and dates come only from the data.",
    icon: "Sparkles",
    fields: [
      { key: "instructions", label: "What to write", kind: "textarea", required: true, maxLength: 1000, placeholder: "A short, friendly reminder that mentions the invoice number, amount due and due date." },
      { key: "data", label: "Data", kind: "text", expression: true, placeholder: "{{ input.invoices }}", help: "The facts to write from. A list produces one draft per item (max 10)." },
      {
        key: "tone",
        label: "Tone",
        kind: "select",
        required: true,
        options: [
          { value: "friendly", label: "Friendly" },
          { value: "neutral", label: "Neutral" },
          { value: "firm", label: "Firm but polite" },
        ],
      },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { data: "{{ input }}", tone: "friendly" },
    retrySafe: true,
    outputHint: "The input plus { draft: { subject, message } } or, for a list, the same list with { subject, message } added to each item, plus { drafts }.",
  },
];
