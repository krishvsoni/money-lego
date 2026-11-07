import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph } from "./build";

const g = graph(
  [
    { id: "weekly", type: "trigger.schedule", label: "Fridays 17:00", at: [0, 0], config: { mode: "weekly", weekday: "5", time: "17:00", timezone: "America/New_York", payload: "{}" } },
    { id: "report", type: "paypal.transactions", label: "Last 7 days in PayPal", at: [1, 0], config: { days: 7 } },
    {
      id: "write",
      type: "ai.write",
      label: "AI writes the digest",
      at: [2, 0],
      config: {
        instructions: "Write a weekly PayPal digest for the owner: number of transactions, totals by status and currency, refunds or reversals, anything that looks unusual. Use only the numbers given. Five short lines at most.",
        data: "{{ input.report }}",
        tone: "neutral",
      },
    },
    { id: "slack", type: "notify.slack", label: "Post to Slack", at: [3, 0], config: { message: "{{ input.draft.subject }}\n{{ input.draft.message }}" } },
  ],
  [["weekly", "report"], ["report", "write"], ["write", "slack"]],
);

export const paypalWeeklyOpsReport: TemplateDefinition = {
  slug: "paypal-weekly-ops-report",
  name: "Weekly PayPal Ops Digest",
  shortDescription: "Every Friday, pull the week's PayPal transactions, let AI summarise them in plain words, and post the digest to Slack.",
  fullDescription: "A read-only workflow: PayPal's Transaction Search API returns the last seven days, Money Lego totals them by status and currency in exact cents, and AI writes a five-line digest from those numbers for Slack.",
  useCase: "Small teams rarely look at PayPal reports until something goes wrong. A short weekly digest keeps everyone aware of volume, refunds and oddities.",
  howItWorks: ["A weekly schedule starts the run.", "Transaction Search returns the week's transactions; totals are computed in cents.", "AI writes the digest from the totals only.", "Slack receives it."],
  category: "Reporting",
  difficulty: "Beginner",
  estimatedSetupMinutes: { min: 2, max: 5 },
  integrations: ["schedule", "paypal", "slack"],
  tags: ["paypal", "reporting", "ai summary"],
  thumbnailAlt: "Workflow diagram: a weekly schedule reads PayPal transactions, AI writes a digest and Slack receives it.",
  graphDefinition: g,
  exampleScenario: {
    headline: "A quiet week with one refund",
    narrative: "14 transactions: 13 completed for 1,820.00 USD and one 25.00 USD refund. The digest says so in five lines.",
    sampleInput: {},
    expectedStepOutputs: [{ nodeId: "report", label: "Totals", exampleOutput: { report: { count: 14, byStatus: { S: { count: 14 } } } } }],
    safetyNotes: ["Example only, a dry run.", "Sandbox transactions can take a few hours to appear in Transaction Search."],
    dryRun: true,
  },
  exampleRun: { dryRun: true, label: "Example only, dry run", steps: [{ nodeId: "report", status: "would_run", note: "Read-only." }] },
  requiredConnections: connectionsOf(g),
  setupChecklist: [{ id: "slack", title: "Connect Slack", detail: "Click Add to Slack and pick a channel.", nodeIds: ["slack"] }],
  safetyNotes: ["Read-only: nothing in PayPal changes.", "Needs Transaction Search enabled on your PayPal app."],
};
