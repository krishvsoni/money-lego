"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api-client";
import { moneySafetyIssues } from "@/lib/templates/validate";
import { layoutGraph } from "@/lib/workflow/layout";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { validateGraph } from "@/lib/workflow/validate";
import type { LogLine } from "../activity-log";
import { idleCrew, type CrewId, type CrewState } from "../crew";
import { readCrewStream, type CrewEvent } from "../crew-stream";

// Sage and the crew working on the workflow open in the editor. Edit, Fix and Link run on
// the server and stream back; Check (Guard) and Tidy (Builder) are instant and local. Every
// change lands through the editor's own commit, so it is one undoable step and autosaves
// like any edit; the crew never writes to the database behind the editor's back.

export interface ThreadItem {
  id: number;
  from: "you" | "sage" | CrewId;
  text: string;
  list?: string[];
  undoable?: boolean;
  tone?: "error";
}

export interface EditorBridge {
  workflowId: string;
  graph: WorkflowGraph;
  applyGraph: (graph: WorkflowGraph) => void;
  rename: (name: string) => void;
  undo: () => void;
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
      } else if (event.type === "error") say({ from: "sage", text: event.message, tone: "error" });
    },
    [say],
  );

  const run = useCallback(
    async (action: "edit" | "fix" | "link", prompt?: string) => {
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

  // Guard, on the spot: every setting the editor would flag plus the money rules.
  const check = useCallback(() => {
    const g = live.current.graph;
    const problems = [...validateGraph(g).map((i) => i.message), ...moneySafetyIssues(g).filter((m) => m.includes(":")).map((m) => m.slice(m.indexOf(":") + 1).trim())];
    setCrew((c) => ({ ...c, guard: { status: "done", detail: problems.length ? `${problems.length} to look at` : "All clear" } }));
    say(
      problems.length
        ? { from: "guard", text: `I found ${problems.length} thing${problems.length === 1 ? "" : "s"} to look at. Fixer can repair what doesn't need your input.`, list: problems.slice(0, 6) }
        : { from: "guard", text: "All clear. Every PayPal money action waits for your approval." },
    );
  }, [say]);

  // Builder, on the spot: lay the canvas out left to right in the order money flows.
  const tidy = useCallback(() => {
    live.current.applyGraph(layoutGraph(live.current.graph));
    setCrew((c) => ({ ...c, builder: { status: "done", detail: "Canvas tidied" } }));
    say({ from: "builder", text: "Tidied the canvas so it reads left to right.", undoable: true });
  }, [say]);

  return { crew, logs, thread, busy, ask: (prompt: string) => run("edit", prompt), fix: () => run("fix"), link: () => run("link"), check, tidy };
}
