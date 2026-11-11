import { describe, expect, it } from "vitest";
import { z } from "zod";
import { nodeDefinition } from "@/lib/nodes/registry";
import { responseFormatFor } from "@/server/agent/response-format";
import { agentDraftSchema } from "@/server/agent/schema";

describe("responseFormatFor (OpenAI Structured Outputs)", () => {
  it("makes a closed, all-required strict schema and drops limits zod still enforces", () => {
    const f = responseFormatFor("review", z.object({ risk: z.enum(["low", "high"]), summary: z.string().min(1).max(600), flags: z.array(z.object({ text: z.string().max(200) })).max(6).default([]) }))!;
    expect(f.json_schema.strict).toBe(true);
    const s = f.json_schema.schema as { additionalProperties: unknown; required: string[]; properties: Record<string, { items?: unknown }> };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["risk", "summary", "flags"]);
    expect(s.properties.summary).toEqual({ type: "string" });
    expect(s.properties.flags.items).toEqual({ type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false });
    expect(JSON.stringify(s)).not.toMatch(/maxLength|minLength|maxItems|"default"|\$schema/);
  });

  it("falls back to a guiding (non-strict) schema when part of it is free-form", () => {
    const f = responseFormatFor("workflow_draft", agentDraftSchema)!;
    expect(f.json_schema.strict).toBe(false);
    expect(f.json_schema.schema.type).toBe("object");
  });

  it("names are safe for OpenAI", () => {
    expect(responseFormatFor("sage reply!", z.object({ a: z.string() }))!.json_schema.name).toBe("sage_reply_");
  });
});

describe("AI decision block", () => {
  it("is registered with Yes, No and Unsure branches and never moves money", () => {
    const d = nodeDefinition("ai.decide")!;
    expect(d.outputs.map((p) => p.id)).toEqual(["yes", "no", "unsure"]);
    expect(d.sideEffect).toBeFalsy();
    expect(d.fields.find((f) => f.key === "question")?.required).toBe(true);
  });
});
