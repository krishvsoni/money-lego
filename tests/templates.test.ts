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

const SLUGS = [
  "opensource-contributor-payout",
  "shopify-approved-supplier-payout",
  "stripe-partner-revenue-allocation",
  "discord-community-bounty-reward",
  "weekly-grant-distribution",
];

describe("template definitions", () => {
  it("are exactly the five specified templates", () => {
    expect(TEMPLATE_DEFINITIONS.map((t) => t.slug)).toEqual(SLUGS);
  });

  it.each(TEMPLATE_DEFINITIONS.map((t) => [t.slug, t] as const))("%s passes registry, edge, safety and leak validation", (_slug, t) => {
    expect(validateTemplate(t)).toEqual([]);
  });

  it("cover all ten external connectors between them", () => {
    const used = new Set(TEMPLATE_DEFINITIONS.flatMap((t) => t.integrations));
    for (const p of ["github", "google-sheets", "discord", "slack", "stripe", "shopify", "telegram", "notion", "airtable", "http"]) expect(used).toContain(p);
  });

  it("put every transfer behind a human approval and a wallet signature", () => {
    for (const t of TEMPLATE_DEFINITIONS) {
      expect(moneySafetyIssues(t.graphDefinition)).toEqual([]);
      const types = t.graphDefinition.nodes.map((n) => n.type);
      expect(types).toContain("logic.approval");
      expect(types).toContain("mh.wallet_sign");
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

  it("can't run as seeded: each needs credentials and setup first", () => {
    for (const t of TEMPLATE_DEFINITIONS) {
      const issues = validateGraph(t.graphDefinition);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((i) => i.field !== undefined)).toBe(true);
    }
  });

  it("schedule the weekly grant run only once a timezone is chosen", () => {
    const grant = TEMPLATE_DEFINITIONS.find((t) => t.slug === "weekly-grant-distribution")!;
    const issues = validateGraph(grant.graphDefinition).filter((i) => i.nodeId === "schedule");
    expect(issues.some((i) => i.field === "timezone")).toBe(true);
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
  it("rejects a transfer that skips approval", () => {
    const issues = validateTemplate(withGraph((g) => (g.edges.find((e) => e.target === "transfer")!.sourcePort = "rejected")));
    expect(issues.join()).toMatch(/after a human approval/);
  });
  it("rejects shipped credentials and real-looking wallets", () => {
    const issues = validateTemplate(
      withGraph((g) => {
        g.nodes[0].config.credentialId = "64b7f0c2a1b2c3d4e5f60718";
        g.nodes[2].config.matchValue = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
      }),
    );
    expect(issues.join()).toMatch(/never carry a credential/);
    expect(issues.join()).toMatch(/real wallet address/);
  });
});

describe("importing a template", () => {
  const t = TEMPLATE_DEFINITIONS[0];

  it("deep-clones the graph, so editing the copy never changes the template", () => {
    const copy = cloneForImport(t.graphDefinition, WORKFLOW_SCHEMA_VERSION);
    copy.nodes[0].config.repository = "someone/else";
    copy.nodes[0].position.x = 9999;
    expect(t.graphDefinition.nodes[0].config.repository).toBe("");
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
