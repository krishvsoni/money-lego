import { nodeDefinition } from "../nodes/registry";
import { validateNodeConfig } from "../nodes/validate-config";
import type { WorkflowGraph } from "./types";

export interface GraphIssue {
  nodeId: string | null;
  field?: string;
  message: string;
}

// Kahn's algorithm. Returns node ids in dependency order, or null when the graph has a
// cycle; cycles are rejected in this version because the engine runs each node once.
export function topologicalOrder(graph: WorkflowGraph): string[] | null {
  const indegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  const queue = graph.nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of graph.edges.filter((edge) => edge.source === id)) {
      const left = (indegree.get(e.target) ?? 0) - 1;
      indegree.set(e.target, left);
      if (left === 0) queue.push(e.target);
    }
  }
  return order.length === graph.nodes.length ? order : null;
}

export function wouldCreateCycle(graph: WorkflowGraph, source: string, target: string): boolean {
  if (source === target) return true;
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    graph.edges.filter((e) => e.source === id).forEach((e) => stack.push(e.target));
  }
  return false;
}

export function validateGraph(graph: WorkflowGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set<string>();
  const triggers = graph.nodes.filter((n) => nodeDefinition(n.type)?.category === "triggers");

  if (graph.nodes.length === 0) return [{ nodeId: null, message: "Add a trigger to start the workflow." }];
  if (triggers.length === 0) issues.push({ nodeId: null, message: "Add a trigger. Every workflow starts with one." });
  if (triggers.length > 1) issues.push({ nodeId: triggers[1].id, message: "Only one trigger per workflow." });

  for (const node of graph.nodes) {
    if (ids.has(node.id)) issues.push({ nodeId: node.id, message: "Duplicate node id." });
    ids.add(node.id);
    const def = nodeDefinition(node.type);
    if (!def) {
      issues.push({ nodeId: node.id, message: `Unknown node type ${node.type}.` });
      continue;
    }
    if (node.disabled) continue;
    for (const issue of validateNodeConfig(def, node.config)) issues.push({ nodeId: node.id, field: issue.field, message: issue.message });
  }

  for (const edge of graph.edges) {
    const from = graph.nodes.find((n) => n.id === edge.source);
    const to = graph.nodes.find((n) => n.id === edge.target);
    const fromDef = from && nodeDefinition(from.type);
    const toDef = to && nodeDefinition(to.type);
    if (!fromDef || !toDef) {
      issues.push({ nodeId: null, message: "A connection points at a node that no longer exists." });
      continue;
    }
    if (!fromDef.outputs.some((p) => p.id === edge.sourcePort)) issues.push({ nodeId: from.id, message: `${fromDef.title} has no "${edge.sourcePort}" output.` });
    if (!toDef.inputs.some((p) => p.id === edge.targetPort)) issues.push({ nodeId: to.id, message: `${toDef.title} can't receive connections.` });
  }

  if (!topologicalOrder(graph)) issues.push({ nodeId: null, message: "The workflow has a loop. Remove a connection so data flows one way." });

  if (triggers.length === 1) {
    const reachable = new Set([triggers[0].id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of graph.edges) {
        if (reachable.has(e.source) && !reachable.has(e.target)) {
          reachable.add(e.target);
          grew = true;
        }
      }
    }
    for (const n of graph.nodes) {
      if (!reachable.has(n.id)) issues.push({ nodeId: n.id, message: "Not connected to the trigger, so it will never run." });
    }
  }
  return issues;
}
