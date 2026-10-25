"use client";

import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, type Edge } from "@xyflow/react";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { BrickNode, type BrickNodeType } from "@/features/workflows/editor/brick-node";

const nodeTypes = { brick: BrickNode };

// A read-only canvas drawn from the template's stored graph, with the same node component
// as the editor, so the preview is exactly what "Use template" will open.
export function GraphPreview({ graph, highlight = [] }: { graph: WorkflowGraph; highlight?: string[] }) {
  const nodes: BrickNodeType[] = useMemo(
    () => graph.nodes.map((n) => ({ id: n.id, type: "brick", position: n.position, selected: highlight.includes(n.id), data: { node: n, status: null, issueCount: 0 } })),
    [graph.nodes, highlight],
  );
  const edges: Edge[] = useMemo(
    () => graph.edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourcePort, target: e.target, targetHandle: e.targetPort, type: "smoothstep" })),
    [graph.edges],
  );
  return (
    <div className="h-[420px] overflow-hidden rounded-2xl border border-line bg-surface" aria-label={`Workflow graph with ${graph.nodes.length} steps`}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.2}
          maxZoom={1.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
