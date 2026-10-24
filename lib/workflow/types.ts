import { z } from "zod";

// The versioned workflow format. A workflow is a directed acyclic graph: nodes carry their
// configuration, edges connect a named output port to a named input port.

export const WORKFLOW_SCHEMA_VERSION = 1;
export const MAX_NODES = 60;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const workflowNodeSchema = z.object({
  id,
  type: z.string().regex(/^[a-z]+\.[a-z_]+$/),
  label: z.preprocess((v) => v || undefined, z.string().trim().max(60).optional()),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  config: z.record(z.string(), z.unknown()).default({}),
  disabled: z.preprocess((v) => v || undefined, z.boolean().optional()),
});

export const workflowEdgeSchema = z.object({
  id,
  source: id,
  sourcePort: z.string().max(20).default("main"),
  target: id,
  targetPort: z.string().max(20).default("main"),
});

export const workflowGraphSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
  nodes: z.array(workflowNodeSchema).max(MAX_NODES),
  edges: z.array(workflowEdgeSchema).max(MAX_NODES * 3),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const emptyGraph = (): WorkflowGraph => ({ schemaVersion: WORKFLOW_SCHEMA_VERSION, nodes: [], edges: [] });

export type RunStatus = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";
export type NodeRunStatus = "pending" | "running" | "waiting" | "succeeded" | "failed" | "skipped" | "cancelled";
export type WaitKind = "approval" | "wallet" | "delay" | "transfer";
