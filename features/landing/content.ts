// Landing copy, kept apart from layout so wording can change without touching markup.

export const TAGLINE = ["AI builds it. PayPal runs it.", "Only you approve the money."];

export const BENEFITS = [
  {
    icon: "equals",
    title: "Exact to the cent",
    body: "Splits use integer cents, so the shares always add back to the exact net. Leftover cents land visibly, never lost to rounding.",
  },
  {
    icon: "clock",
    title: "Runs that outlive a closed tab",
    body: "Every step is saved as it finishes. Approvals and payout checks pick up on the server, even after a restart.",
  },
  {
    icon: "copy",
    title: "One payment, one run",
    body: "However many times a payment notification arrives, it's handled once. Nobody gets paid twice."
  },
  {
    icon: "receipt",
    title: "PayPal's numbers, not guesses",
    body: "Splits use what actually landed after PayPal's fee, and a payout only counts as done when PayPal confirms each person was paid.",
  },
];

export const STEPS = [
  {
    title: "Describe it, get a graph",
    body: "Tell Sage what should happen when money arrives. It lays out every step on the canvas, from the payment to the split to the payout, and you can change any of it.",
  },
  {
    title: "Approve exactly what will happen",
    body: "Before any payout, refund or invoice goes out, the run pauses and shows you the recipients, amounts and an AI risk review. Approval is fingerprinted.",
  },
  {
    title: "PayPal does the rest, you see everything",
    body: "Payouts, refunds and invoices go out through PayPal, and every payment, payout and invoice shows up on your Payments page.",
  },
];

export const FAQ = [
  {
    q: "Who is Money Lego for?",
    a: "Small businesses, agencies and creators who get paid through PayPal and spend too much time splitting revenue, chasing invoices and following up on failed payments by hand.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. Describe what you want in a sentence and Money Lego builds the workflow for you. You can adjust any step by clicking on it, or start from a ready-made template.",
  },
  {
    q: "Can it move money without me?",
    a: "Never. Before anyone is paid, refunded or sent an invoice, Money Lego stops and shows you exactly who gets what. Nothing happens until you approve it.",
  },
  {
    q: "What if something changes after I approve?",
    a: "Then it doesn't go through. Your approval covers exactly what you saw. If an amount or a person changes, Money Lego asks you again instead of guessing.",
  },
  {
    q: "Could someone get paid twice?",
    a: "No. Each payment is handled once, even if the same notification arrives more than once or a step is retried.",
  },
  {
    q: "What does the AI actually do?",
    a: "It builds workflows from your description, double-checks payments for anything unusual before you approve, drafts friendly reminders for overdue invoices, and explains in plain words what happened in any run. It suggests; you decide.",
  },
  {
    q: "Is my customers' information safe?",
    a: "The AI only sees what it needs for the task, with email addresses hidden. Your PayPal login and keys are never shared with it.",
  },
  {
    q: "Is this real money?",
    a: "Not yet. Everything runs on PayPal's test environment, so you can try every workflow end to end with test accounts and test money.",
  },
];
