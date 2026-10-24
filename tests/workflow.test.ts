import { describe, expect, it } from "vitest";
import { sumRaw } from "@/lib/amounts";
import { resolveValue, type Scope } from "@/lib/workflow/expressions";
import { TEMPLATES } from "@/lib/workflow/templates";
import { emptyGraph, type WorkflowGraph } from "@/lib/workflow/types";
import { topologicalOrder, validateGraph, wouldCreateCycle } from "@/lib/workflow/validate";
import { splitByPercent } from "@/lib/amounts";
import { compare } from "@/server/engine/executors/core";

const scope: Scope = { input: { amount: "12.5", list: [1, 2], nested: { a: { b: true } } }, trigger: { body: { type: "x" } }, nodes: { split: { amountRaw: "100" } }, run: { id: "r", workflowId: "w" } };

describe("expressions", () => {
  it("keeps the type of a whole-string expression", () => {
    expect(resolveValue("{{ input.list }}", scope)).toEqual([1, 2]);
    expect(resolveValue("{{input.nested.a.b}}", scope)).toBe(true);
  });
  it("interpolates mixed text and nested config", () => {
    expect(resolveValue({ m: "Pay {{ input.amount }} for {{ trigger.body.type }}" }, scope)).toEqual({ m: "Pay 12.5 for x" });
    expect(resolveValue("{{ nodes.split.amountRaw }}", scope)).toBe("100");
    expect(resolveValue("{{ input.list[1] }}", scope)).toBe(2);
  });
  it("refuses prototype access and unknown roots", () => {
    expect(resolveValue("{{ input.__proto__ }}", scope)).toBeUndefined();
    expect(resolveValue("{{ input.constructor.name }}", scope)).toBeUndefined();
    expect(resolveValue("{{ process.env.SECRET }}", scope)).toBeUndefined();
    expect(resolveValue("{{ input.amount; 1 }}", scope)).toBeUndefined();
  });
});

describe("splitByPercent", () => {
  it("is exact for awkward percentages", () => {
    const parts = splitByPercent(100n, [3333, 3333, 3334]);
    expect(sumRaw(parts)).toBe(100n);
    const odd = splitByPercent(1_000_001n, [6000, 4000]);
    expect(sumRaw(odd)).toBe(1_000_001n);
    expect(odd).toEqual([600_001n, 400_000n]);
  });
});

describe("compare", () => {
  it("compares numbers numerically and text exactly", () => {
    expect(compare("10", "gt", "9")).toBe(true);
    expect(compare("abc", "gt", "abd")).toBe(false);
    expect(compare("payout.requested", "equals", "payout.requested")).toBe(true);
    expect(compare(undefined, "exists", "")).toBe(false);
    expect(compare(["a", "b"], "contains", "b")).toBe(true);
  });
});

const node = (id: string, type: string, config: Record<string, unknown> = {}) => ({ id, type, position: { x: 0, y: 0 }, config });

describe("graph validation", () => {
  it("rejects cycles", () => {
    const g: WorkflowGraph = { ...emptyGraph(), nodes: [node("t", "trigger.manual"), node("a", "util.log", { message: "x" }), node("b", "util.log", { message: "y" })], edges: [
      { id: "1", source: "t", sourcePort: "main", target: "a", targetPort: "main" },
      { id: "2", source: "a", sourcePort: "main", target: "b", targetPort: "main" },
      { id: "3", source: "b", sourcePort: "main", target: "a", targetPort: "main" },
    ] };
    expect(topologicalOrder(g)).toBeNull();
    expect(validateGraph(g).some((i) => /loop/.test(i.message))).toBe(true);
    expect(wouldCreateCycle({ ...g, edges: g.edges.slice(0, 2) }, "b", "a")).toBe(true);
  });
  it("needs exactly one trigger and connected nodes", () => {
    expect(validateGraph(emptyGraph())[0].message).toMatch(/trigger/);
    const g: WorkflowGraph = { ...emptyGraph(), nodes: [node("t", "trigger.manual"), node("x", "util.log", { message: "x" })], edges: [] };
    expect(validateGraph(g).some((i) => i.nodeId === "x" && /never run/.test(i.message))).toBe(true);
  });
  it("rejects ports that don't exist", () => {
    const g: WorkflowGraph = { ...emptyGraph(), nodes: [node("t", "trigger.manual"), node("a", "util.log", { message: "x" })], edges: [{ id: "1", source: "t", sourcePort: "true", target: "a", targetPort: "main" }] };
    expect(validateGraph(g).some((i) => /no "true" output/.test(i.message))).toBe(true);
  });
  it("flags what the example template still needs, and nothing structural", () => {
    const g = TEMPLATES.find((t) => t.id === "webhook-payout")!.graph();
    expect(topologicalOrder(g)).toHaveLength(g.nodes.length);
    const issues = validateGraph(g);
    expect(issues.every((i) => i.nodeId !== null)).toBe(true);
    expect(new Set(issues.map((i) => i.nodeId))).toEqual(new Set(["webhook", "split", "discord"]));
  });
});
