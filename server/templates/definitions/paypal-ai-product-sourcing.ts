import type { TemplateDefinition } from "@/lib/templates/types";
import { connectionsOf, graph } from "./build";

const sample = JSON.stringify({ request: "A quiet mechanical keyboard for a small design studio", maxPrice: "150", client: "Studio North" }, null, 2);

const g = graph(
  [
    { id: "request", type: "trigger.manual", label: "Shopping request", at: [0, 0], config: { samplePayload: sample } },
    { id: "search", type: "shop.search", label: "Find real products", at: [1, 0], config: { query: "{{ trigger.request }}", maxPrice: "{{ trigger.maxPrice }}", limit: 6 } },
    { id: "pick", type: "ai.pick", label: "AI picks the best one", at: [2, 0], config: { request: "{{ trigger.request }}", criteria: "In stock, within budget, best rated, from a well-known store." } },
    {
      id: "approval",
      type: "logic.approval",
      label: "You approve the purchase",
      at: [3, 0],
      config: { message: "Buy {{ input.pick.title }} for {{ input.pick.price }} {{ input.pick.currency }} from {{ input.pick.merchant }}? Why: {{ input.pickReason }}", timeoutHours: 24 },
    },
    { id: "checkout", type: "paypal.checkout_link", label: "PayPal checkout link", at: [0, 1], config: { productId: "{{ input.pick.id }}", note: "Sourced for {{ trigger.client }}" } },
    { id: "send", type: "notify.slack", label: "Send link to buyer", at: [1, 1], config: { message: "Checkout ready for {{ trigger.client }}: {{ input.checkout.product }} ({{ input.checkout.price }} {{ input.checkout.currency }}). Pay here: {{ input.checkout.approveUrl }}" } },
    { id: "wait", type: "paypal.wait_checkout", label: "Wait for payment", at: [2, 1], config: { timeoutHours: 72 } },
    { id: "done", type: "util.log", label: "Record outcome", at: [3, 1], config: { message: "Purchase for {{ trigger.client }}: {{ input.purchase.status }} (order {{ input.purchase.orderId }}, capture {{ input.purchase.captureId }})." } },
  ],
  [["request", "search"], ["search", "pick"], ["pick", "approval"], ["approval", "checkout", "approved"], ["checkout", "send"], ["send", "wait"], ["wait", "done"], ["wait", "done", "failed"]],
);

export const paypalAiProductSourcing: TemplateDefinition = {
  slug: "paypal-ai-product-sourcing",
  name: "AI Product Sourcing → PayPal Checkout",
  shortDescription: "Describe what a client needs; Channel3 finds real products, AI picks one, you approve, and the buyer pays through a PayPal checkout link.",
  fullDescription:
    "A shopping request starts the run. Channel3 returns real, in-stock products with live prices; AI picks the best match and explains why using only those facts. You approve the exact product and price. Money Lego re-checks the price with Channel3, creates a PayPal checkout, sends the link to the buyer, waits for them to pay and captures the payment.",
  useCase: "Agencies, personal shoppers and small retailers source products for clients by hand: searching stores, comparing, sending links and chasing payment. This turns a request into a reviewed purchase with a PayPal payment at the end.",
  howItWorks: [
    "Start it with a request, a budget and the client's name (or swap in a webhook from your intake form).",
    "Channel3 finds real products that are in stock and within budget.",
    "AI picks one and says why. It can only pick from the search results, and prices come from Channel3.",
    "You approve the exact product, store and price.",
    "The price is re-checked; if it changed, nothing is created. Otherwise PayPal creates a checkout.",
    "The buyer gets the link, approves the payment on PayPal, and the workflow captures it once.",
  ],
  category: "Agentic Commerce",
  difficulty: "Intermediate",
  estimatedSetupMinutes: { min: 3, max: 8 },
  integrations: ["channel3", "paypal", "slack"],
  tags: ["paypal", "channel3", "agentic commerce", "checkout", "ai"],
  thumbnailAlt: "Workflow diagram: a shopping request searches Channel3, AI picks a product, the owner approves, a PayPal checkout link is sent to the buyer, and the workflow waits for payment and captures it.",
  graphDefinition: g,
  exampleScenario: {
    headline: "A studio needs a quiet keyboard under $150",
    narrative: "Channel3 returns six keyboards. AI picks a low-noise model at $129.00 from a major store. You approve; PayPal creates a $129.00 checkout; the client pays with a sandbox account and the workflow captures it.",
    sampleInput: { request: "A quiet mechanical keyboard for a small design studio", maxPrice: "150", client: "Studio North" },
    expectedStepOutputs: [
      { nodeId: "search", label: "Real products", exampleOutput: { productCount: 6 } },
      { nodeId: "pick", label: "AI pick", exampleOutput: { pick: { title: "Low-profile mechanical keyboard", price: "129.00", currency: "USD" }, pickReason: "Quiet switches, best rated under budget." } },
      { nodeId: "approval", label: "Waits for you", exampleOutput: { waiting: "approval", shows: ["product", "store", "129.00 USD"] } },
      { nodeId: "wait", label: "Paid", exampleOutput: { purchase: { status: "COMPLETED" } } },
    ],
    safetyNotes: ["Example only, a dry run.", "PayPal Sandbox: the buyer pays with a test account."],
    dryRun: true,
  },
  exampleRun: {
    dryRun: true,
    label: "Example only, dry run",
    steps: [
      { nodeId: "search", status: "would_run", note: "Reads product data only." },
      { nodeId: "approval", status: "would_wait", note: "Waits for your decision." },
      { nodeId: "checkout", status: "would_run", note: "Only after approval, at the re-checked price." },
      { nodeId: "wait", status: "would_wait", note: "Waits for the buyer to pay." },
    ],
  },
  requiredConnections: connectionsOf(g),
  setupChecklist: [
    { id: "channel3", title: "Channel3 on the server", detail: "Set CHANNEL3_API_KEY (promo PAYPAL-HACKATHON-2026 for credits).", nodeIds: ["search"] },
    { id: "slack", title: "Connect Slack", detail: "Click Add to Slack and pick the channel where checkout links should go (or swap in Telegram).", nodeIds: ["send"] },
  ],
  safetyNotes: ["Nothing is bought without your approval of the exact product and price.", "If the price changes after approval, no checkout is created.", "The buyer always approves the payment on PayPal."],
};
