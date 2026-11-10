"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api-client";
import { layoutGraph } from "@/lib/workflow/layout";
import type { WorkflowGraph } from "@/lib/workflow/types";
import type { LogLine } from "../activity-log";
import { idleCrew, type CrewId, type CrewState } from "../crew";
import { readCrewStream, type CrewEvent, type SageAction, type SageFinding } from "../crew-stream";

// Sage and the crew working on the workflow open in the editor. Asking Sage runs a health
// check first, then answers (steps plus one-click actions) or makes the change; Fix, Link and
// Check run on the server and stream back; Tidy (Builder) is instant and local. Every
// change lands through the editor's own commit, so it is one undoable step and autosaves
// like any edit; the crew never writes to the database behind the editor's back.

export interface ThreadItem {
  id: number;
  from: "you" | "sage" | CrewId;
  text: string;
  list?: string[];
  undoable?: boolean;
  tone?: "error";
  findings?: SageFinding[];
  actions?: SageAction[];
}

export interface EditorBridge {
  workflowId: string;
  graph: WorkflowGraph;
  applyGraph: (graph: WorkflowGraph) => void;
  rename: (name: string) => void;
  undo: () => void;
  // Lets Sage's one-click actions use the editor's own controls (same checks, same toasts).
  setEnabled?: (on: boolean) => Promise<void>;
  testRun?: () => Promise<void>;
}

let nextId = 1;

export function useSageEdit(bridge: EditorBridge) {
  const [crew, setCrew] = useState<CrewState>(idleCrew);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // Event handlers read the editor's latest graph through this ref, so a long crew run
  // always hands back changes made against the canvas as it was when the run started.
  const live = useRef(bridge);
  useLayoutEffect(() => {
    live.current = bridge;
  });

  const say = useCallback((item: Omit<ThreadItem, "id">) => setThread((t) => [...t.slice(-40), { ...item, id: nextId++ }]), []);

  const apply = useCallback(
    (event: CrewEvent) => {
      if (event.type === "agent") setCrew((c) => ({ ...c, [event.id]: { status: event.status, detail: event.detail } }));
      else if (event.type === "log") setLogs((l) => [...l, { agent: event.agent, text: event.text, at: Date.now() }]);
      else if (event.type === "edited") {
        const changed = JSON.stringify(event.graph) !== JSON.stringify(live.current.graph);
        if (changed) live.current.applyGraph(event.graph);
        if (event.name) live.current.rename(event.name);
        say({ from: "sage", text: event.summary, list: [...event.missing, ...event.notes], undoable: changed });
      } else if (event.type === "answer") {
        say({ from: event.findings.length || event.steps.length ? "sage" : "guard", text: event.text, list: event.steps, findings: event.findings, actions: event.actions });
      } else if (event.type === "error") say({ from: "sage", text: event.message, tone: "error" });
    },
    [say],
  );

  const run = useCallback(
    async (action: "assist" | "edit" | "fix" | "link", prompt?: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setCrew(idleCrew());
      setLogs([]);
      if (prompt) say({ from: "you", text: prompt });
      try {
        const body = { action, workflowId: live.current.workflowId, graph: live.current.graph, ...(prompt ? { prompt } : {}) };
        const finished = await readCrewStream("/api/agent/edit", body, apply);
        if (!finished) say({ from: "sage", text: "The connection dropped before the crew finished. Nothing was changed.", tone: "error" });
      } catch (e) {
        say({ from: "sage", text: errorMessage(e), tone: "error" });
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [apply, say],
  );

  // Guard: the full health check on the server — settings, whether the trigger is live, every
  // connected account tested live, the PayPal app, recent runs and the scheduler.
  const check = useCallback(() => run("assist"), [run]);

  // Builder, on the spot: lay the canvas out left to right in the order money flows.
  const tidy = useCallback(() => {
    live.current.applyGraph(layoutGraph(live.current.graph));
    setCrew((c) => ({ ...c, builder: { status: "done", detail: "Canvas tidied" } }));
    say({ from: "builder", text: "Tidied the canvas so it reads left to right.", undoable: true });
  }, [say]);

  return { crew, logs, thread, busy, ask: (prompt: string) => run("assist", prompt), plan: (prompt: string) => run("edit", prompt), fix: () => run("fix"), link: () => run("link"), check, tidy };
}
