"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/lib/workflow/types";
import { validateGraph, wouldCreateCycle } from "@/lib/workflow/validate";
import type { WorkflowDTO } from "@/lib/workflow/dto";

export type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

const HISTORY_LIMIT = 60;
const AUTOSAVE_MS = 900;

let counter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function useWorkflowEditor(initial: WorkflowDTO) {
  const [workflow, setWorkflow] = useState(initial);
  const [graph, setGraph] = useState<WorkflowGraph>(initial.graph);
  const [name, setName] = useState(initial.name);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const past = useRef<WorkflowGraph[]>([]);
  const future = useRef<WorkflowGraph[]>([]);
  const version = useRef(initial.version);
  // The source of truth for synchronous reads in event handlers; state mirrors it for render.
  const latest = useRef({ graph: initial.graph, name: initial.name });
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistory({ undo: past.current.length, redo: future.current.length });

  const setCurrentGraph = useCallback((value: WorkflowGraph) => {
    latest.current = { ...latest.current, graph: value };
    setGraph(value);
  }, []);

  const issues = useMemo(() => validateGraph(graph), [graph]);

  // Every user-meaningful change goes through commit(), which records an undo step.
  // History is mutated here, outside React updaters, so strict-mode double invocation
  // can never record a step twice.
  const commit = useCallback(
    (next: WorkflowGraph | ((g: WorkflowGraph) => WorkflowGraph)) => {
      const current = latest.current.graph;
      const value = typeof next === "function" ? next(current) : next;
      if (value === current) return;
      past.current = [...past.current.slice(-HISTORY_LIMIT + 1), current];
      future.current = [];
      setCurrentGraph(value);
      syncHistory();
      setSaveState("dirty");
    },
    [setCurrentGraph],
  );

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(latest.current.graph);
    setCurrentGraph(previous);
    syncHistory();
    setSaveState("dirty");
  }, [setCurrentGraph]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current.graph);
    setCurrentGraph(next);
    syncHistory();
    setSaveState("dirty");
  }, [setCurrentGraph]);

  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const { workflow: saved, disabledReason } = await api<{ workflow: WorkflowDTO; disabledReason: string | null }>(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        body: { name: latest.current.name.trim() || "Untitled workflow", graph: latest.current.graph, expectedVersion: version.current },
      });
      version.current = saved.version;
      setWorkflow(saved);
      const unchanged = latest.current.graph === graph && latest.current.name === name;
      setSaveState(unchanged ? "saved" : "dirty");
      setSaveError(disabledReason);
      return saved;
    } catch (e) {
      const conflict = e instanceof ApiError && e.code === "STALE_WRITE";
      setSaveState(conflict ? "conflict" : "error");
      setSaveError(conflict ? "Someone saved this workflow elsewhere. Reload to get their version." : errorMessage(e));
      return null;
    }
  }, [workflow.id, graph, name]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [saveState, graph, name, save]);

  const addNode = useCallback(
    (type: string, position: { x: number; y: number }, connectFrom?: { nodeId: string; port: string }) => {
      const def = nodeDefinition(type);
      if (!def || def.unavailable) return null;
      const node: WorkflowNode = { id: newId("n"), type, position, config: structuredClone(def.defaults) };
      commit((g) => {
        const edges = [...g.edges];
        if (connectFrom && def.inputs.length) edges.push({ id: newId("e"), source: connectFrom.nodeId, sourcePort: connectFrom.port, target: node.id, targetPort: "main" });
        return { ...g, nodes: [...g.nodes, node], edges };
      });
      setSelectedId(node.id);
      return node.id;
    },
    [commit],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<Pick<WorkflowNode, "config" | "label" | "disabled">>) =>
      commit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),
    [commit],
  );

  const removeNodes = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      commit((g) => ({ ...g, nodes: g.nodes.filter((n) => !ids.includes(n.id)), edges: g.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target)) }));
      setSelectedId((s) => (s && ids.includes(s) ? null : s));
    },
    [commit],
  );

  const removeEdges = useCallback((ids: string[]) => ids.length && commit((g) => ({ ...g, edges: g.edges.filter((e) => !ids.includes(e.id)) })), [commit]);

  // Returns why a connection is refused, or null when it's allowed.
  const connect = useCallback(
    (edge: Omit<WorkflowEdge, "id">): string | null => {
      const g = latest.current.graph;
      const target = g.nodes.find((n) => n.id === edge.target);
      if (!target || !nodeDefinition(target.type)?.inputs.length) return "Triggers start a workflow, so nothing can connect into them.";
      if (wouldCreateCycle(g, edge.source, edge.target)) return "That would make a loop. Data has to flow one way.";
      if (g.edges.some((e) => e.source === edge.source && e.sourcePort === edge.sourcePort && e.target === edge.target)) return "Those are already connected.";
      commit((cur) => ({ ...cur, edges: [...cur.edges, { ...edge, id: newId("e") }] }));
      return null;
    },
    [commit],
  );

  // Dragging updates positions live without history; on drop, the pre-drag graph becomes
  // the undo step, so one drag undoes in one go.
  const dragStart = useRef<WorkflowGraph | null>(null);
  const moveNodes = useCallback(
    (positions: Record<string, { x: number; y: number }>, finished: boolean) => {
      const current = latest.current.graph;
      if (Object.keys(positions).length) {
        dragStart.current ??= current;
        setCurrentGraph({ ...current, nodes: current.nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)) });
      }
      if (finished && dragStart.current) {
        past.current = [...past.current.slice(-HISTORY_LIMIT + 1), dragStart.current];
        future.current = [];
        dragStart.current = null;
        syncHistory();
        setSaveState("dirty");
      }
    },
    [setCurrentGraph],
  );

  const rename = useCallback((value: string) => {
    latest.current = { ...latest.current, name: value };
    setName(value);
    setSaveState("dirty");
  }, []);

  return {
    workflow,
    setWorkflow,
    graph,
    name,
    issues,
    saveState,
    saveError,
    selectedId,
    setSelectedId,
    canUndo: history.undo > 0,
    canRedo: history.redo > 0,
    undo,
    redo,
    save,
    addNode,
    updateNode,
    removeNodes,
    removeEdges,
    connect,
    moveNodes,
    rename,
  };
}

export type Editor = ReturnType<typeof useWorkflowEditor>;
