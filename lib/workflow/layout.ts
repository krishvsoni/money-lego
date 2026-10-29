import { topologicalOrder } from "./validate";
import type { WorkflowGraph } from "./types";

// Lays a workflow out left to right: each node's column is the longest path to it from the
// trigger, and nodes sharing a column stack downward. Used by the agent's Builder for new
// drafts and by "Tidy" in the editor. Returns a new graph; the input is left untouched.

const COL = 290;
const ROW = 170;

export function layoutGraph(graph: WorkflowGraph): WorkflowGraph {
  const order = topologicalOrder(graph) ?? graph.nodes.map((n) => n.id);
  const depth = new Map<string, number>();
  for (const id of order) {
    const parents = graph.edges.filter((e) => e.target === id).map((e) => depth.get(e.source) ?? 0);
    depth.set(id, parents.length ? Math.max(...parents) + 1 : 0);
  }
  const rows = new Map<number, number>();
  const placed = new Map<string, { x: number; y: number }>();
  for (const id of order) {
    const col = depth.get(id) ?? 0;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    placed.set(id, { x: col * COL, y: row * ROW });
  }
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: placed.get(n.id) ?? n.position })) };
}
