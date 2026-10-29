"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError, errorMessage, newRequestKey } from "@/lib/api-client";
import type { ApiErrorBody } from "@/lib/dto";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import { idleCrew, type CrewId, type CrewState, type CrewStatus } from "./crew";

export interface MasonResult {
  workflow: WorkflowDTO;
  notes: string[];
  setupIssues: number;
  linked: string[];
  missing: string[];
}

type Phase = { phase: "idle" } | { phase: "building" } | { phase: "done"; result: MasonResult } | { phase: "error"; message: string };

type StreamEvent =
  | { type: "agent"; id: CrewId; status: Exclude<CrewStatus, "waiting">; detail?: string }
  | ({ type: "result" } & MasonResult)
  | { type: "error"; message: string };

export const MIN_PROMPT = 12;

// Reads the crew's progress line by line as the server streams it. The request key is kept
// until a build finishes, so retrying after a dropped connection can't make two workflows.
export function useMason() {
  const [state, setState] = useState<Phase>({ phase: "idle" });
  const [crew, setCrew] = useState<CrewState>(idleCrew);
  const requestKey = useRef(newRequestKey());
  const inFlight = useRef(false);

  const apply = useCallback((event: StreamEvent) => {
    if (event.type === "agent") setCrew((c) => ({ ...c, [event.id]: { status: event.status, detail: event.detail } }));
    else if (event.type === "result") {
      setState({ phase: "done", result: event });
      requestKey.current = newRequestKey();
    } else setState({ phase: "error", message: event.message });
  }, []);

  const build = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (inFlight.current || text.length < MIN_PROMPT) return;
      inFlight.current = true;
      setCrew(idleCrew());
      setState({ phase: "building" });
      try {
        const res = await fetch("/api/agent/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: text, requestKey: requestKey.current }),
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok || !res.body) {
          const e = ((await res.json().catch(() => null)) as Partial<ApiErrorBody> | null)?.error;
          throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Mason couldn't start. Try again.");
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
            const event = JSON.parse(line) as StreamEvent;
            if (event.type !== "agent") finished = true;
            apply(event);
          }
        }
        if (!finished) setState({ phase: "error", message: "The connection dropped before Mason finished. Try again; nothing is built twice." });
      } catch (e) {
        setState({ phase: "error", message: e instanceof TypeError ? "Can't reach Money Lego. Check your connection and try again." : errorMessage(e) });
      } finally {
        inFlight.current = false;
      }
    },
    [apply],
  );

  const reset = useCallback(() => {
    requestKey.current = newRequestKey();
    setCrew(idleCrew());
    setState({ phase: "idle" });
  }, []);

  return { state, crew, build, reset };
}
