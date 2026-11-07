import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph } from "./build";

const g = graph(
  [
    { id: "weekly", type: "trigger.schedule", label: "Every Monday 9:00", at: [0, 0], config: { mode: "weekly", weekday: "1", time: "09:00", timezone: "America/New_York", payload: "{}" } },
    { id: "find", type: "paypal.find_invoices", label: "Overdue PayPal invoices", at: [1, 0], config: { status: "UNPAID", overdueOnly: true, limit: 10 } },
    { id: "any", type: "logic.filter", label: "Anything overdue?", at: [2, 0], config: { left: "{{ input.invoiceCount }}", operator: "gt", right: "0" } },
    {
      id: "write",
      type: "ai.write",
      label: "AI drafts reminders",
      at: [3, 0],
      config: {
        instructions: "Write a short, warm payment reminder for each invoice. Mention the invoice number, the amount due with currency and how many days it is overdue. Offer help if something is unclear. Sign off as the accounts team.",
        data: "{{ input.invoices }}",
        tone: "friendly",
      },
    },
    { id: "approval", type: "logic.approval", label: "Review the drafts", at: [1, 1], config: { message: "Send {{ input.invoiceCount }} PayPal reminders with the AI-drafted notes?", timeoutHours: 48 } },
    { id: "remind", type: "paypal.send_invoice", label: "Send PayPal reminders", at: [2, 1], config: { mode: "remind", subject: "A friendly reminder about your invoice", note: "Just a reminder that this invoice is past due. Thank you!" } },
    { id: "slack", type: "notify.slack", label: "Post summary", at: [3, 1], config: { message: "Sent {{ input.sent.length }} PayPal invoice reminders this week. Run {{ run.id }}." } },
  ],
  [["weekly", "find"], ["find", "any"], ["any", "write"], ["write", "approval"], ["approval", "remind", "approved"], ["remind", "slack"]],
);

export const paypalInvoiceReminders: TemplateDefinition = {
  slug: "paypal-invoice-reminders",
  name: "AI Invoice Reminder Assistant",
  shortDescription: "Every week, find overdue PayPal invoices, let AI draft a personal reminder for each, approve, and send them through PayPal.",
  fullDescription:
    "Each Monday Money Lego searches your PayPal invoices for ones that are sent but unpaid and past due. AI drafts a short, polite reminder per invoice using only the invoice's own facts. You review the drafts and approve; PayPal then sends each reminder from your account, and Slack gets a summary.",
  useCase: "Freelancers and agencies lose hours chasing late invoices and often don't chase at all. This keeps follow-ups consistent and personal without writing each one.",
  howItWorks: [
    "A weekly schedule starts the run.",
    "PayPal's invoice search returns sent, unpaid and partly paid invoices past their due date (up to 10).",
    "If nothing is overdue, the run stops quietly.",
    "AI writes one reminder per invoice from its number, amount due and days overdue. It never invents amounts or dates, and customer emails are masked before the model sees anything.",
    "You review the drafts and approve the exact list of invoices and notes.",
    "PayPal sends each reminder; repeating the step can't send it twice.",
    "Slack gets the count.",
  ],
  category: "Accounts Receivable",
  difficulty: "Beginner",
  estimatedSetupMinutes: { min: 3, max: 8 },
  integrations: ["schedule", "paypal", "slack"],
  tags: ["paypal", "invoicing", "ai drafting", "collections"],
  thumbnailAlt: "Workflow diagram: a weekly schedule finds overdue PayPal invoices, AI drafts a reminder for each, the owner approves, PayPal sends the reminders and Slack gets a summary.",
  graphDefinition: g,
  exampleScenario: {
    headline: "Two invoices are overdue and get personal reminders",
    narrative: "Invoice 0042 (450.00 USD, 9 days overdue) and 0047 (1,200.00 USD, 3 days overdue) are found. AI drafts two reminders; you tweak nothing and approve; PayPal sends both.",
    sampleInput: { scheduledFor: "2026-11-09T14:00:00.000Z" },
    expectedStepOutputs: [
      { nodeId: "find", label: "Overdue invoices", exampleOutput: { invoiceCount: 2, invoices: [{ id: "INV2-AAAA-BBBB-CCCC-DDDD", number: "0042", due: "450.00", daysOverdue: 9 }] } },
      { nodeId: "write", label: "AI drafts", exampleOutput: { invoices: [{ number: "0042", subject: "Invoice 0042 is 9 days overdue", message: "Hi! A quick reminder that invoice 0042 for 450.00 USD…" }] } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["2 invoices", "notes"] } },
    ],
    safetyNotes: ["Example only, a dry run.", "Reminders go through PayPal's own invoice email; Money Lego never emails customers directly."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "find", status: "would_run", note: "Reads invoices; changes nothing." },
      { nodeId: "write", status: "would_run", note: "Drafts text only." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
      { nodeId: "remind", status: "would_run", note: "Only after approval." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "schedule", title: "Pick when to check", detail: "Day, time and your timezone.", nodeIds: ["weekly"] },
    { id: "invoices", title: "Have some sandbox invoices", detail: "Create and send a couple of invoices in your PayPal sandbox business account with a past due date, or use the Create invoice block.", nodeIds: ["find"] },
    { id: "slack", title: "Connect Slack", detail: "Click Add to Slack and pick a channel.", nodeIds: ["slack"] },
  ],
  safetyNotes: ["Nothing is sent without your approval.", "AI sees invoice facts with customer emails masked.", "Invoicing must be enabled on your PayPal app."],
};
