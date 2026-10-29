import { z } from "zod";

// The shape we ask the model for. Lenient on extras and casing of optional parts, strict on
// what the graph builder relies on.

const nodeId = z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const agentDraftSchema = z.object({
  name: z.string().trim().min(1).max(80).catch("Drafted workflow"),
  description: z.string().trim().max(300).catch(""),
  notes: z.array(z.string().trim().max(240)).max(8).catch([]),
  nodes: z
    .array(
      z.object({
        id: nodeId,
        type: z.string().trim(),
        label: z.string().trim().max(60).optional().catch(undefined),
        config: z.record(z.string(), z.unknown()).optional().catch({}),
      }),
    )
    .min(1)
    .max(30),
  edges: z
    .array(z.object({ from: nodeId, to: nodeId, port: z.string().trim().max(20).optional().catch(undefined) }))
    .max(90)
    .default([]),
});

export type AgentDraft = z.infer<typeof agentDraftSchema>;

export const draftRequestSchema = z.object({
  prompt: z.string().trim().min(12, "Describe the workflow in a sentence or two.").max(1_200),
  requestKey: z.string().uuid().optional(),
});
