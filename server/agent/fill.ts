import type { WorkflowGraph } from "@/lib/workflow/types";

// A backstop for values the person already wrote in their request: if the model left one of
// these settings empty, it's filled from the request text instead of asking again. Only empty
// settings are touched, so anything the model (or the person) set is kept.

// "under $60", "below 60", "budget of 60 USD", "max 59.99", "up to $60", "less than 60", "$60 budget"
const BUDGET = [
  /\b(?:under|below|less than|up to|at most|no more than|max(?:imum)?|budget(?: of| is)?|within)\s*(?:of\s*)?[$€£₹]?\s*(\d{1,7}(?:\.\d{1,2})?)/i,
  /[$€£₹]\s*(\d{1,7}(?:\.\d{1,2})?)\s*(?:budget|max|or less)/i,
];

export function budgetFrom(request: string): string | null {
  for (const re of BUDGET) {
    const m = request.match(re);
    if (m && Number(m[1]) > 0) return m[1];
  }
  return null;
}

// The words someone types in Slack: the first quoted phrase, e.g. with "buy me flowers".
export function quotedPhrase(request: string): string | null {
  const m = request.match(/["“”']([^"“”']{2,80})["“”']/);
  return m ? m[1].trim() : null;
}

const empty = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

export function fillFromRequest(graph: WorkflowGraph, request: string): WorkflowGraph {
  const budget = budgetFrom(request);
  const phrase = quotedPhrase(request);
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      if (n.type === "shop.search" && budget && empty(n.config.maxPrice)) return { ...n, config: { ...n.config, maxPrice: budget } };
      if (n.type === "trigger.slack_mention" && phrase && empty(n.config.phrase)) return { ...n, config: { ...n.config, phrase } };
      return n;
    }),
  };
}
