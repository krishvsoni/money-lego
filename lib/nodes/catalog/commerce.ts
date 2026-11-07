import { MAIN_IN, MAIN_OUT, type NodeDefinition } from "../types";

// Product data for agentic commerce. Channel3 returns real products with prices, offers and
// buy links; AI may compare them but every fact it shows comes from this response.

export const commerceNodes: NodeDefinition[] = [
  {
    type: "channel3.search",
    summary: "Find real products, prices and offers.",
    title: "Channel3 product search",
    category: "integrations",
    description:
      "Search Channel3's product catalog for a free-text request. Returns real products with brand, image, price, availability and merchant offers, so AI suggestions and PayPal orders are grounded in actual product data.",
    icon: "ShoppingCart",
    provider: "channel3",
    fields: [
      { key: "query", label: "Looking for", kind: "text", required: true, expression: true, maxLength: 300, placeholder: "{{ trigger.request }}" },
      { key: "maxPrice", label: "Max price", kind: "text", expression: true, placeholder: "150" },
      { key: "limit", label: "Results", kind: "number", min: 1, max: 10, required: true },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { query: "{{ trigger.request }}", limit: 5 },
    retrySafe: true,
    outputHint: "The input plus { products: [{ id, title, brand, image, price, currency, availability, merchant, buyUrl }], productCount }.",
  },
];
