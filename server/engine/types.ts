import "server-only";
import type { ObjectId } from "mongodb";
import type { Scope } from "@/lib/workflow/expressions";
import type { WaitKind, WorkflowNode } from "@/lib/workflow/types";
import type { WorkflowRunDoc } from "../db/types";

// What an executor sees and returns. Executors are plain async functions: given resolved
// config and the node's input, produce an output (on a port), ask to wait, or throw.

export interface ExecContext {
  run: WorkflowRunDoc;
  node: WorkflowNode;
  config: Record<string, unknown>;
  input: unknown;
  scope: Scope;
  ownerId: ObjectId;
  // Saved between attempts of a waiting node, e.g. an approval decision or a deadline.
  waitState: Record<string, unknown> | null;
  signal: AbortSignal;
  log: (message: string, level?: "info" | "warn" | "error") => void;
}

export type ExecResult =
  | { kind: "ok"; output: unknown; port?: string | null }
  | { kind: "wait"; wait: { kind: WaitKind; until: Date | null; ref: string | null }; state: Record<string, unknown> };

export type Executor = (ctx: ExecContext) => Promise<ExecResult>;

export class NodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeError";
  }
}

export const ok = (output: unknown, port: string | null = "main"): ExecResult => ({ kind: "ok", output, port });

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { value };
}
