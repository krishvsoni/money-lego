import { describe, expect, it } from "vitest";
import { reviewGraph, toGraph } from "@/server/agent/guardrails";
import { agentDraftSchema, type AgentDraft } from "@/server/agent/schema";

function draft(overrides: Partial<AgentDraft> = {}): AgentDraft {
  return agentDraftSchema.parse({
    name: "Revenue split",
    nodes: [
      { id: "pay", type: "trigger.paypal_checkout", config: { itemName: "Session", amount: "100.00", currency: "USD" } },
      { id: "split", type: "data.allocate", config: { total: "{{ trigger.net }}", currency: "{{ trigger.currency }}", mode: "percent", recipients: [{ label: "Creator", email: "creator@example.com", share: 70 }, { label: "Reserve", email: "", share: 30 }] } },
      { id: "review", type: "ai.review", config: {} },
      { id: "approve", type: "logic.approval", config: { message: "Pay {{ input.allocation.payout }}?", timeoutHours: 24 } },
      { id: "payout", type: "paypal.payout", config: { subject: "Your share" } },
      { id: "wait", type: "paypal.payout_status", config: { timeoutHours: 48 } },
    ],
    edges: [
      { from: "pay", to: "split" },
      { from: "split", to: "review" },
      { from: "review", to: "approve" },
      { from: "approve", to: "payout", port: "approved" },
      { from: "payout", to: "wait" },
    ],
    ...overrides,
  });
}

describe("agent guardrails", () => {
  it("accepts a payout that sits directly behind an approval", () => {
    expect(reviewGraph(toGraph(draft())).blocking).toEqual([]);
  });

  it("blocks a payout that skips human approval", () => {
    const d = draft();
    d.nodes = d.nodes.filter((n) => n.id !== "approve");
    d.edges = [...d.edges.filter((e) => e.from !== "approve" && e.to !== "approve"), { from: "review", to: "payout" }];
    const { blocking } = reviewGraph(toGraph(d));
    expect(blocking.some((i) => i.nodeId === "payout" && /approval/i.test(i.message))).toBe(true);
  });

  it("blocks a payout from the rejected branch", () => {
    const d = draft();
    d.edges = d.edges.map((e) => (e.from === "approve" ? { ...e, port: "rejected" } : e));
    expect(reviewGraph(toGraph(d)).blocking.length).toBeGreaterThan(0);
  });

  it("blocks a side door into a money action even when an approval also feeds it", () => {
    const d = draft();
    d.edges.push({ from: "split", to: "payout" });
    expect(reviewGraph(toGraph(d)).blocking.some((i) => i.nodeId === "payout")).toBe(true);
  });

  it("requires a payout before payout status", () => {
    const d = draft();
    d.nodes = d.nodes.filter((n) => n.id !== "payout");
    d.edges = [...d.edges.filter((e) => e.to !== "payout" && e.from !== "payout"), { from: "approve", to: "wait", port: "approved" }];
    expect(reviewGraph(toGraph(d)).blocking.some((i) => i.nodeId === "wait")).toBe(true);
  });

  it("puts refunds and invoice sends behind approvals too", () => {
    const d = draft({
      nodes: [
        { id: "start", type: "trigger.manual", config: {} },
        { id: "refund", type: "paypal.refund", config: { captureId: "{{ trigger.captureId }}" } },
      ],
      edges: [{ from: "start", to: "refund" }],
    });
    expect(reviewGraph(toGraph(d)).blocking.some((i) => i.nodeId === "refund")).toBe(true);
  });

  it("drops unknown node types and edges that pointed at them", () => {
    const d = draft();
    d.nodes.push({ id: "evil", type: "shell.exec", config: {} });
    d.edges.push({ from: "wait", to: "evil" });
    const g = toGraph(d);
    expect(g.nodes.some((n) => n.id === "evil")).toBe(false);
    expect(g.edges.some((e) => e.target === "evil")).toBe(false);
  });

  it("never keeps a credential the model made up, nor fields the node doesn't have", () => {
    const d = draft();
    d.nodes.push({ id: "slack", type: "notify.slack", config: { credentialId: "cred_from_model", message: "Done", apiKey: "sk-123" } });
    d.edges.push({ from: "wait", to: "slack" });
    const slack = toGraph(d).nodes.find((n) => n.id === "slack")!;
    expect(slack.config.credentialId).toBeUndefined();
    expect(slack.config.apiKey).toBeUndefined();
    expect(slack.config.message).toBe("Done");
  });

  it("ignores an invalid select value from the model and keeps the default", () => {
    const d = draft();
    d.nodes[0].config = { ...d.nodes[0].config, currency: "BTC" };
    expect(toGraph(d).nodes[0].config.currency).toBe("USD");
  });

  it("turns numeric table cells into text the inspector can edit", () => {
    const split = toGraph(draft()).nodes.find((n) => n.id === "split")!;
    expect((split.config.recipients as Array<Record<string, string>>)[0].share).toBe("70");
  });

  it("lays nodes out left to right along the flow", () => {
    const g = toGraph(draft());
    const x = (id: string) => g.nodes.find((n) => n.id === id)!.position.x;
    expect(x("pay")).toBeLessThan(x("split"));
    expect(x("payout")).toBeLessThan(x("wait"));
  });
});
