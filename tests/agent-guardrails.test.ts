import { describe, expect, it } from "vitest";
import { reviewGraph, toGraph } from "@/server/agent/guardrails";
import { agentDraftSchema, type AgentDraft } from "@/server/agent/schema";
import { supportedTokens } from "@/lib/tokens";

const usdc = supportedTokens()[0].mint;

function draft(overrides: Partial<AgentDraft> = {}): AgentDraft {
  return agentDraftSchema.parse({
    name: "Weekly payroll",
    nodes: [
      { id: "start", type: "trigger.manual" },
      { id: "rows", type: "data.payout_rows", config: { rows: "{{ input.rows }}", tokenMint: usdc, walletField: "wallet", amountField: "amount" } },
      { id: "quote", type: "mh.estimate" },
      { id: "approve", type: "logic.approval", config: { message: "Pay {{ input.amount }}?", timeoutHours: 24 } },
      { id: "create", type: "mh.create_transfer" },
      { id: "sign", type: "mh.wallet_sign", config: { timeoutHours: 24 } },
      { id: "wait", type: "mh.wait_status", config: { target: "completed", timeoutHours: 72 } },
    ],
    edges: [
      { from: "start", to: "rows" },
      { from: "rows", to: "quote" },
      { from: "quote", to: "approve" },
      { from: "approve", to: "create", port: "approved" },
      { from: "create", to: "sign" },
      { from: "sign", to: "wait" },
    ],
    ...overrides,
  });
}

describe("agent guardrails", () => {
  it("accepts a payout that goes through approval and wallet signing", () => {
    const { blocking } = reviewGraph(toGraph(draft()));
    expect(blocking).toEqual([]);
  });

  it("blocks a transfer that skips human approval", () => {
    const d = draft();
    d.nodes = d.nodes.filter((n) => n.id !== "approve");
    d.edges = [...d.edges.filter((e) => e.from !== "approve" && e.to !== "approve"), { from: "quote", to: "create" }];
    const { blocking } = reviewGraph(toGraph(d));
    expect(blocking.some((i) => i.nodeId === "create" && /approval/.test(i.message))).toBe(true);
  });

  it("blocks a transfer from the rejected branch", () => {
    const d = draft();
    d.edges = d.edges.map((e) => (e.from === "approve" ? { ...e, port: "rejected" } : e));
    expect(reviewGraph(toGraph(d)).blocking.length).toBeGreaterThan(0);
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

  it("replaces an unsupported token with the network's vetted one", () => {
    const d = draft();
    d.nodes[1].config = { ...d.nodes[1].config, tokenMint: "NotARealMint111111111111111111111111111111" };
    expect(toGraph(d).nodes[1].config.tokenMint).toBe(usdc);
  });

  it("lays nodes out left to right along the flow", () => {
    const g = toGraph(draft());
    const x = (id: string) => g.nodes.find((n) => n.id === id)!.position.x;
    expect(x("start")).toBeLessThan(x("rows"));
    expect(x("create")).toBeLessThan(x("wait"));
  });
});
