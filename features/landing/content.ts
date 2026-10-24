// Landing copy, kept apart from layout so wording can change without touching markup.

export const TAGLINE = ["Automation gets it ready.", "Only your wallet moves it."];

export const BENEFITS = [
  {
    icon: "equals",
    title: "Exact to the base unit",
    body: "Splits use integer math, so 100 USDC at 33.33, 33.33 and 33.34 percent always adds back to exactly 100 USDC.",
  },
  {
    icon: "clock",
    title: "Runs that outlive a closed tab",
    body: "Every step is saved as it finishes. Delays, approvals and wallet waits resume on the server, even after a restart.",
  },
  {
    icon: "copy",
    title: "One delivery, one payout",
    body: "A webhook sent twice, a retried request or a double click all resolve to the same run. Nothing is paid twice.",
  },
  {
    icon: "receipt",
    title: "Real quotes, not estimates",
    body: "The protocol fee, the SOL you need up front and what each recipient receives come from MultiHopper's live quote.",
  },
];

export const STEPS = [
  {
    title: "Snap the bricks together",
    body: "Drag a trigger, a split and the MultiHopper steps onto the canvas and connect them. Problems show up while you build, not while money moves.",
  },
  {
    title: "Review the live quote",
    body: "Each run gets a quote with the exact fee and net amount per recipient. Approval steps pause the run until you say yes.",
  },
  {
    title: "Sign and track",
    body: "Your wallet signs the transfer in the order MultiHopper requires. Every hop and payout is then recorded with its signature.",
  },
];

export const FAQ = [
  {
    q: "Does Money Lego hold my funds or keys?",
    a: "No. Transfers go from your wallet into MultiHopper's route. Signing happens in your wallet, and the server never sees a private key or seed phrase.",
  },
  {
    q: "Can a schedule or webhook send money without me?",
    a: "No. Triggers can start a run and prepare a quote, but the run waits at the wallet step until you sign. Nothing can fund a transfer on your behalf.",
  },
  {
    q: "Which tokens can I send?",
    a: "USDC on devnet today. A token is only added after MultiHopper confirms it is supported on that network.",
  },
  {
    q: "What does a transfer cost?",
    a: "MultiHopper charges a percentage of the amount plus a small fee per hop, paid in SOL. You see the exact figures in the quote before you sign.",
  },
  {
    q: "What happens if the same webhook arrives twice?",
    a: "It maps to the run it already started. Retries from your systems never create a second payout.",
  },
  {
    q: "What if the server restarts in the middle of a run?",
    a: "The run continues from the last saved step. A step that may already have sent a message is flagged for you instead of being sent again.",
  },
  {
    q: "Does routing make payouts private?",
    a: "Routing spreads a transfer across hops, but Solana history stays public. We don't claim anonymity, and neither should anyone else.",
  },
  {
    q: "Which wallets work?",
    a: "Any wallet that supports the Solana wallet standard, including Phantom, Solflare and Backpack.",
  },
];
