"use client";

import { useCallback, useRef, useState } from "react";
import { errorMessage, newRequestKey } from "@/lib/api-client";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import type { LogLine } from "./activity-log";
import { idleCrew, type CrewState } from "./crew";
import { readCrewStream, type CrewEvent, type PlanNode } from "./crew-stream";

export type { PlanNode } from "./crew-stream";

export interface SageResult {
  workflow: WorkflowDTO;
  notes: string[];
  setupIssues: number;
  linked: string[];
  missing: string[];
}

type Phase = { phase: "idle" } | { phase: "building" } | { phase: "done"; result: SageResult } | { phase: "error"; message: string };

export const MIN_PROMPT = 12;

// Builds a new workflow from a sentence, following the crew's stream: faces, the activity
// log, blocks sketched while the model writes and confirmed once Guard passes them. The
// request key is kept until a build finishes, so a retry can't make two workflows.
export function useSage() {
  const [state, setState] = useState<Phase>({ phase: "idle" });
  const [crew, setCrew] = useState<CrewState>(idleCrew);
  const [plan, setPlan] = useState<PlanNode[] | null>(null);
  const [sketch, setSketch] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [sent, setSent] = useState("");
  const requestKey = useRef(newRequestKey());
  const inFlight = useRef(false);

  const apply = useCallback((event: CrewEvent) => {
    if (event.type === "agent") setCrew((c) => ({ ...c, [event.id]: { status: event.status, detail: event.detail } }));
    else if (event.type === "log") setLogs((l) => [...l, { agent: event.agent, text: event.text, at: Date.now() }]);
    else if (event.type === "sketch") setSketch(event.types);
    else if (event.type === "plan") setPlan(event.nodes);
    else if (event.type === "result") {
      setState({ phase: "done", result: event });
      requestKey.current = newRequestKey();
    } else if (event.type === "error") setState({ phase: "error", message: event.message });
  }, []);

  const clear = () => {
    setCrew(idleCrew());
    setPlan(null);
    setSketch([]);
    setLogs([]);
  };

  const build = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (inFlight.current || text.length < MIN_PROMPT) return;
      inFlight.current = true;
      clear();
      setSent(text);
      setState({ phase: "building" });
      try {
        const finished = await readCrewStream("/api/agent/draft", { prompt: text, requestKey: requestKey.current }, apply);
        if (!finished) setState({ phase: "error", message: "The connection dropped before Sage finished. Try again; nothing is built twice." });
      } catch (e) {
        setState({ phase: "error", message: errorMessage(e) });
      } finally {
        inFlight.current = false;
      }
    },
    [apply],
  );

  const reset = useCallback(() => {
    requestKey.current = newRequestKey();
    clear();
    setSent("");
    setState({ phase: "idle" });
  }, []);

  return { state, crew, plan, sketch, logs, sent, build, reset };
}
