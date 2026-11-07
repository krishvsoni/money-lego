import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeDefinition } from "@/lib/nodes/registry";
import { cloneForImport, TemplateImportError } from "@/lib/templates/import";
import { thumbnailUrlFor } from "@/lib/templates/types";
import { moneySafetyIssues, validateTemplate } from "@/lib/templates/validate";
import { WORKFLOW_SCHEMA_VERSION } from "@/lib/workflow/types";
import { validateGraph } from "@/lib/workflow/validate";
import { TEMPLATE_DEFINITIONS } from "@/server/templates/definitions";

const SLUGS = ["paypal-sale-revenue-split", "paypal-invoice-reminders", "paypal-subscription-recovery", "paypal-refund-desk", "paypal-weekly-ops-report"];

describe("template definitions", () => {
  it("are exactly the specified templates", () => {
    expect(TEMPLATE_DEFINITIONS.map((t) => t.slug)).toEqual(SLUGS);
  });

  it.each(TEMPLATE_DEFINITIONS.map((t) => [t.slug, t] as const))("%s passes registry, edge, safety and leak validation", (_slug, t) => {
    expect(validateTemplate(t)).toEqual([]);
  });

  it("all use PayPal, and between them cover payouts, refunds, invoicing, subscriptions and reporting", () => {
    for (const t of TEMPLATE_DEFINITIONS) expect(t.integrations).toContain("paypal");
    const types = new Set(TEMPLATE_DEFINITIONS.flatMap((t) => t.graphDefinition.nodes.map((n) => n.type)));
    for (const type of ["trigger.paypal_checkout", "trigger.paypal_event", "paypal.payout", "paypal.payout_status", "paypal.refund", "paypal.find_invoices", "paypal.send_invoice", "paypal.get_subscription", "paypal.transactions", "ai.review", "ai.write"]) {
      expect(types).toContain(type);
    }
  });

  it("put every PayPal money action directly behind a human approval", () => {
    for (const t of TEMPLATE_DEFINITIONS) {
      expect(moneySafetyIssues(t.graphDefinition)).toEqual([]);
      const sideEffects = t.graphDefinition.nodes.filter((n) => nodeDefinition(n.type)?.sideEffect);
      if (sideEffects.length) expect(t.graphDefinition.nodes.map((n) => n.type)).toContain("logic.approval");
    }
  });

  it("keep sample runs labelled as dry runs, with step ids that exist in the graph", () => {
    for (const t of TEMPLATE_DEFINITIONS) {
      expect(t.exampleScenario.dryRun).toBe(true);
      expect(t.exampleRun.dryRun).toBe(true);
      const ids = new Set(t.graphDefinition.nodes.map((n) => n.id));
      for (const s of t.exampleScenario.expectedStepOutputs) expect(ids.has(s.nodeId)).toBe(true);
    }
  });

  it("only ever need settings filled in, never structural fixes", () => {
    for (const t of TEMPLATE_DEFINITIONS) expect(validateGraph(t.graphDefinition).every((i) => i.field !== undefined)).toBe(true);
  });

  it("ship only example.com recipients", () => {
    const split = TEMPLATE_DEFINITIONS[0].graphDefinition.nodes.find((n) => n.type === "data.allocate")!;
    for (const r of split.config.recipients as Array<{ email: string }>) expect(r.email === "" || r.email.endsWith("@example.com")).toBe(true);
  });
});

describe("template validation catches broken templates", () => {
  const base = TEMPLATE_DEFINITIONS[0];
  const withGraph = (patch: (g: typeof base.graphDefinition) => void) => {
    const g = structuredClone(base.graphDefinition);
    patch(g);
    return { ...base, graphDefinition: g };
  };

  it("rejects an unknown node type", () => {
    expect(validateTemplate(withGraph((g) => (g.nodes[1].type = "logic.nonexistent"))).join()).toMatch(/unknown node type/);
  });
  it("rejects an edge from a port that doesn't exist", () => {
    expect(validateTemplate(withGraph((g) => (g.edges[0].sourcePort = "nope"))).join()).toMatch(/no "nope" output/);
  });
  it("rejects a payout that skips approval", () => {
    const issues = validateTemplate(withGraph((g) => (g.edges.find((e) => e.target === "payout")!.sourcePort = "rejected")));
    expect(issues.join()).toMatch(/Human approval's Approved output/);
  });
  it("rejects shipped credentials and real email addresses", () => {
    const issues = validateTemplate(
      withGraph((g) => {
        g.nodes.find((n) => n.id === "slack")!.config.credentialId = "64b7f0c2a1b2c3d4e5f60718";
        g.nodes.find((n) => n.id === "split")!.config.recipients = [{ label: "Real person", email: "jane.doe@gmail.com", share: "100" }];
      }),
    );
    expect(issues.join()).toMatch(/never carry a credential/);
    expect(issues.join()).toMatch(/example\.com/);
  });
});

describe("importing a template", () => {
  const t = TEMPLATE_DEFINITIONS[0];

  it("deep-clones the graph, so editing the copy never changes the template", () => {
    const copy = cloneForImport(t.graphDefinition, WORKFLOW_SCHEMA_VERSION);
    copy.nodes[0].config.itemName = "Something else";
    copy.nodes[0].position.x = 9999;
    expect(t.graphDefinition.nodes[0].config.itemName).toBe("Brand strategy session");
    expect(t.graphDefinition.nodes[0].position.x).toBe(0);
  });

  it("keeps positions, edges and labels, and empties every credential slot", () => {
    const poisoned = structuredClone(t.graphDefinition);
    poisoned.nodes.forEach((n) => {
      if (nodeDefinition(n.type)?.fields.some((f) => f.kind === "credential")) n.config.credentialId = "64b7f0c2a1b2c3d4e5f60718";
    });
    const copy = cloneForImport(poisoned, WORKFLOW_SCHEMA_VERSION);
    expect(copy.edges).toEqual(t.graphDefinition.edges);
    expect(copy.nodes.map((n) => [n.id, n.position, n.label])).toEqual(t.graphDefinition.nodes.map((n) => [n.id, n.position, n.label]));
    expect(copy.nodes.every((n) => n.config.credentialId === undefined)).toBe(true);
  });

  it("refuses an unknown schema version or node type", () => {
    expect(() => cloneForImport(t.graphDefinition, 99)).toThrow(TemplateImportError);
    const bad = structuredClone(t.graphDefinition);
    bad.nodes[1].type = "logic.nonexistent";
    expect(() => cloneForImport(bad, WORKFLOW_SCHEMA_VERSION)).toThrow(/doesn't have/);
  });
});

describe("thumbnails", () => {
  it.each(SLUGS)("%s has a local, self-contained 16:9 SVG", (slug) => {
    const file = join(process.cwd(), "public", thumbnailUrlFor(slug));
    expect(existsSync(file)).toBe(true);
    const svg = readFileSync(file, "utf8");
    expect(svg).toMatch(/viewBox="0 0 1280 720"/);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    expect(svg).not.toMatch(/<image|<script|@import|xlink:href|<foreignObject/i);
  });
  it("has a designed local fallback", () => {
    expect(existsSync(join(process.cwd(), "public", "templates", "fallback.svg"))).toBe(true);
  });
});
