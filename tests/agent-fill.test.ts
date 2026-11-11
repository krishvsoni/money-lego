import { describe, expect, it } from "vitest";
import { budgetFrom, fillFromRequest, quotedPhrase } from "@/server/agent/fill";
import type { WorkflowGraph } from "@/lib/workflow/types";

const graph = (nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>): WorkflowGraph => ({
  schemaVersion: 1,
  nodes: nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
  edges: [],
});

describe("budgetFrom", () => {
  it.each([
    ["find a real bouquet under $60 and let AI pick one", "60"],
    ["something below 45.50", "45.50"],
    ["a keyboard, budget of 150", "150"],
    ["max $99", "99"],
    ["up to €80 please", "80"],
    ["$60 budget", "60"],
  ])("%s -> %s", (text, want) => expect(budgetFrom(text)).toBe(want));

  it("finds nothing when no budget is given", () => {
    expect(budgetFrom("find me flowers")).toBeNull();
    expect(budgetFrom("under $0")).toBeNull();
  });
});

describe("fillFromRequest", () => {
  const prompt = 'When someone tags Krish in Slack with "buy me flowers", find a real bouquet under $60 and let AI pick one.';

  it("fills an empty max price and Slack phrase from the request", () => {
    const g = fillFromRequest(
      graph([
        { id: "t", type: "trigger.slack_mention", config: { phrase: "" } },
        { id: "s", type: "shop.search", config: { query: "Flower", maxPrice: "" } },
      ]),
      prompt,
    );
    expect(g.nodes[0].config.phrase).toBe("buy me flowers");
    expect(g.nodes[1].config).toEqual({ query: "Flower", maxPrice: "60" });
  });

  it("never overwrites a value that's already set", () => {
    const g = fillFromRequest(graph([{ id: "s", type: "shop.search", config: { maxPrice: "40" } }]), prompt);
    expect(g.nodes[0].config.maxPrice).toBe("40");
  });

  it("reads the first quoted phrase", () => {
    expect(quotedPhrase("tag Krish with “buy me flowers” in Slack")).toBe("buy me flowers");
    expect(quotedPhrase("no quotes here")).toBeNull();
  });
});
