"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState, type DragEvent } from "react";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, useReactFlow,
  type Connection, type Edge, type EdgeChange, type IsValidConnection, type NodeChange,
} from "@xyflow/react";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { NodeRunStatus } from "@/lib/workflow/types";
import { wouldCreateCycle } from "@/lib/workflow/validate";
import { BrickNode, type BrickNodeType } from "./brick-node";
import { EmptyCanvas } from "./empty-canvas";
import type { Editor } from "./use-workflow-editor";

export const DRAG_MIME = "application/x-money-lego-node";
const nodeTypes = { brick: BrickNode };

export function Canvas({ editor, statuses, onRefuse }: { editor: Editor; statuses: Record<string, NodeRunStatus>; onRefuse: (message: string) => void }) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { graph, selectedId } = editor;

  const issueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of editor.issues) if (i.nodeId) counts[i.nodeId] = (counts[i.nodeId] ?? 0) + 1;
    return counts;
  }, [editor.issues]);

  const derived: BrickNodeType[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: "brick",
        position: n.position,
        selected: n.id === selectedId,
        data: { node: n, status: statuses[n.id] ?? null, issueCount: issueCounts[n.id] ?? 0 },
      })),
    [graph.nodes, selectedId, statuses, issueCounts],
  );

  // React Flow measures nodes after render and reports sizes as changes. The canvas is
  // derived from the graph, plus the measurements React Flow reported, which is what
  // fit-view, the minimap and edge routing need.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const nodes = useMemo(() => derived.map((n) => ({ ...n, measured: measured[n.id] })), [derived, measured]);

  // An edge animates only while data is moving into the node it feeds.
  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const live = statuses[e.target] === "running" || (statuses[e.source] === "succeeded" && statuses[e.target] === "waiting");
        const idle = statuses[e.target] === "skipped" || statuses[e.target] === "cancelled";
        return {
          id: e.id,
          source: e.source,
          sourceHandle: e.sourcePort,
          target: e.target,
          targetHandle: e.targetPort,
          type: "smoothstep",
          animated: live,
          style: { strokeDasharray: idle ? "4 4" : undefined, opacity: idle ? 0.5 : 1 },
        };
      }),
    [graph.edges, statuses],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<BrickNodeType>[]) => {
      const sized: Record<string, { width: number; height: number }> = {};
      for (const c of changes) if (c.type === "dimensions" && c.dimensions) sized[c.id] = c.dimensions;
      if (Object.keys(sized).length) setMeasured((m) => ({ ...m, ...sized }));
      const moved: Record<string, { x: number; y: number }> = {};
      let finished = false;
      const removed: string[] = [];
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          moved[c.id] = c.position;
          if (!c.dragging) finished = true;
        } else if (c.type === "position" && c.dragging === false) finished = true;
        if (c.type === "select" && c.selected) editor.setSelectedId(c.id);
        if (c.type === "remove") removed.push(c.id);
      }
      if (Object.keys(moved).length || finished) editor.moveNodes(moved, finished);
      if (removed.length) editor.removeNodes(removed);
    },
    [editor],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => editor.removeEdges(changes.filter((c) => c.type === "remove").map((c) => c.id)),
    [editor],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const refused = editor.connect({ source: c.source, sourcePort: c.sourceHandle ?? "main", target: c.target, targetPort: c.targetHandle ?? "main" });
      if (refused) onRefuse(refused);
    },
    [editor, onRefuse],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (c) => {
      const target = graph.nodes.find((n) => n.id === c.target);
      return Boolean(target && nodeDefinition(target.type)?.inputs.length) && !wouldCreateCycle(graph, c.source, c.target);
    },
    [graph],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      const type = e.dataTransfer.getData(DRAG_MIME);
      if (!type) return;
      e.preventDefault();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      editor.addNode(type, { x: p.x - 116, y: p.y - 32 });
    },
    [editor, screenToFlowPosition],
  );

  return (
    <div className="relative h-full w-full" onDragOver={(e) => e.dataTransfer.types.includes(DRAG_MIME) && (e.preventDefault(), (e.dataTransfer.dropEffect = "copy"))} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneClick={() => editor.setSelectedId(null)}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1, minZoom: 0.6 }}
        minZoom={0.25}
        maxZoom={1.75}
        snapToGrid
        snapGrid={[11, 11]}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
        <Controls showInteractive={false} position="bottom-left" />
        {graph.nodes.length > 0 && (
        <MiniMap
          position="bottom-right"
          style={{ width: 168, height: 108 }}
          pannable
          zoomable
          nodeBorderRadius={6}
          nodeClassName={(n) => `mm-${nodeDefinition((n.data as { node: { type: string } }).node.type)?.category ?? "unknown"}`}
        />
        )}
      </ReactFlow>
      {graph.nodes.length === 0 && (
        <EmptyCanvas
          onPick={(type) => {
            editor.addNode(type, { x: 0, y: 0 });
            requestAnimationFrame(() => fitView({ padding: 0.6, maxZoom: 1 }));
          }}
        />
      )}
    </div>
  );
}
