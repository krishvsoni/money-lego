"use client";

import { ApiError } from "@/lib/api-client";
import type { ApiErrorBody } from "@/lib/dto";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { CrewId, CrewStatus } from "./crew";

// Reads a crew run as the server streams it, one JSON event per line, and hands each event
// over as it arrives. Resolves true when the run ended with a result, false if the
// connection closed first. Errors before the stream opens arrive as ordinary API errors.

export interface PlanNode {
  id: string;
  type: string;
  label: string | null;
}

export type CrewEvent =
  | { type: "agent"; id: CrewId; status: Exclude<CrewStatus, "waiting">; detail?: string }
  | { type: "log"; agent: CrewId; text: string }
  | { type: "sketch"; types: string[] }
  | { type: "plan"; nodes: PlanNode[] }
  | { type: "result"; workflow: WorkflowDTO; notes: string[]; setupIssues: number; linked: string[]; missing: string[] }
  | { type: "edited"; graph: WorkflowGraph; name: string | null; notes: string[]; summary: string; linked: string[]; missing: string[] }
  | { type: "answer"; text: string; steps: string[]; findings: SageFinding[]; actions: SageAction[] }
  | { type: "error"; message: string };

// Sage's health-check findings and the one-click actions it may offer (server/agent/doctor.ts).
export interface SageFinding {
  level: "blocker" | "warn" | "ok";
  area: "workflow" | "connection" | "paypal" | "runs" | "server";
  text: string;
}

export type SageAction =
  | { id: string; kind: "enable" | "fix" | "link" | "test"; label: string }
  | { id: string; kind: "open"; label: string; href: string };

export async function readCrewStream(url: string, body: unknown, onEvent: (event: CrewEvent) => void): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach Money Lego. Check your connection and try again.");
  }
  if (!res.ok || !res.body) {
    const e = ((await res.json().catch(() => null)) as Partial<ApiErrorBody> | null)?.error;
    throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Sage couldn't start. Try again.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as CrewEvent;
      if (event.type === "result" || event.type === "edited" || event.type === "answer" || event.type === "error") finished = true;
      onEvent(event);
    }
  }
  return finished;
}
