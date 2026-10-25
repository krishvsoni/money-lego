"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useToast } from "@/components/toast";
import { api, errorMessage } from "@/lib/api-client";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { CredentialDTO, WorkflowDTO } from "@/lib/workflow/dto";
import { Canvas } from "./canvas";
import { Catalog, type CatalogHandle } from "./catalog";
import { Inspector } from "./inspector";
import { RunPanel } from "./run-panel";
import { Toolbar } from "./toolbar";
import { useWorkflowEditor } from "./use-workflow-editor";
import { useWorkflowRuns } from "./use-workflow-runs";

function EditorShell({ initial, initialRunId }: { initial: WorkflowDTO; initialRunId: string | null }) {
  const editor = useWorkflowEditor(initial);
  const toast = useToast();
  const runs = useWorkflowRuns(initial.id, initialRunId, toast);
  const catalog = useRef<CatalogHandle>(null);
  const { getViewport } = useReactFlow();
  const [credentials, setCredentials] = useState<CredentialDTO[]>([]);
  const [toggling, setToggling] = useState(false);

  const refreshCredentials = useCallback(async () => {
    const r = await api<{ credentials: CredentialDTO[] }>("/api/credentials").catch(() => null);
    if (r) setCredentials(r.credentials);
    return r?.credentials ?? [];
  }, []);

  useEffect(() => {
    api<{ credentials: CredentialDTO[] }>("/api/credentials")
      .then((r) => setCredentials(r.credentials))
      .catch(() => null);
  }, []);

  // Clicking a catalog entry adds the node to the right of the selected node and wires it
  // from that node's first output; with nothing selected it lands in view.
  const addFromCatalog = useCallback(
    (type: string) => {
      const from = editor.graph.nodes.find((n) => n.id === editor.selectedId);
      const fromDef = from && nodeDefinition(from.type);
      if (from && fromDef?.outputs.length) {
        editor.addNode(type, { x: from.position.x + 300, y: from.position.y }, { nodeId: from.id, port: fromDef.outputs[0].id });
        return;
      }
      const vp = getViewport();
      editor.addNode(type, { x: (-vp.x + 360) / vp.zoom, y: (-vp.y + 200) / vp.zoom });
    },
    [editor, getViewport],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void editor.save();
      } else if (!typing && mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        catalog.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  const test = async () => {
    if (editor.saveState !== "saved" && !(await editor.save())) return;
    await runs.startTest();
  };

  const toggleEnabled = async () => {
    setToggling(true);
    try {
      if (editor.saveState !== "saved" && !(await editor.save())) return;
      const { workflow } = await api<{ workflow: WorkflowDTO }>(`/api/workflows/${initial.id}/enabled`, { body: { enabled: !editor.workflow.enabled } });
      editor.setWorkflow(workflow);
      toast(workflow.enabled ? "Workflow is on. Its trigger is live." : "Workflow is off.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setToggling(false);
    }
  };

  const nodeRun = runs.detail?.nodes?.find((n) => n.nodeId === editor.selectedId) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      <Toolbar editor={editor} onTest={test} testing={runs.busy === "test"} onToggleEnabled={toggleEnabled} toggling={toggling} />
      {editor.saveError && editor.saveState !== "conflict" && <p className="border-b border-line bg-attention-wash px-4 py-1.5 text-xs text-attention">{editor.saveError}</p>}
      <div className="flex min-h-0 flex-1">
        <Catalog ref={catalog} onAdd={addFromCatalog} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <Canvas editor={editor} statuses={runs.statuses} onRefuse={(m) => toast(m, "error")} />
          </div>
          <RunPanel runs={runs} graph={editor.graph} workflowId={initial.id} />
        </div>
        <Inspector editor={editor} credentials={credentials} onCredentialCreated={(c) => setCredentials((list) => [c, ...list])} onRefreshCredentials={refreshCredentials} nodeRun={nodeRun} />
      </div>
    </div>
  );
}

export function WorkflowEditor(props: { initial: WorkflowDTO; initialRunId: string | null }) {
  return (
    <ReactFlowProvider>
      <EditorShell {...props} />
    </ReactFlowProvider>
  );
}
