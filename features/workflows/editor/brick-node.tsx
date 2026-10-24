"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import type { NodeRunStatus, WorkflowNode } from "@/lib/workflow/types";
import { NodeIcon } from "../node-icon";

export type BrickData = { node: WorkflowNode; status: NodeRunStatus | null; issueCount: number };
export type BrickNodeType = Node<BrickData, "brick">;

const STATUS: Partial<Record<NodeRunStatus, { ring: string; label: string; tone: string }>> = {
  running: { ring: "ring-[3px] ring-progress/60 pulse-ring", label: "Running", tone: "text-progress" },
  waiting: { ring: "ring-[3px] ring-attention/70", label: "Waiting", tone: "text-attention" },
  succeeded: { ring: "ring-2 ring-success/60", label: "Done", tone: "text-success" },
  failed: { ring: "ring-[3px] ring-danger/70", label: "Failed", tone: "text-danger" },
  skipped: { ring: "", label: "Skipped", tone: "text-ink-3" },
  cancelled: { ring: "", label: "Cancelled", tone: "text-ink-3" },
};

function BrickNodeView({ data, selected }: NodeProps<BrickNodeType>) {
  const def = nodeDefinition(data.node.type);
  const color = def ? CATEGORY_META[def.category].color : "var(--ink-3)";
  const status = data.status ? STATUS[data.status] : undefined;
  const faded = data.node.disabled || data.status === "skipped" || data.status === "cancelled";
  const multiOut = (def?.outputs.length ?? 0) > 1;

  return (
    <div className={`relative w-[232px] ${faded ? "opacity-55" : ""}`} style={{ ["--brick" as string]: color }}>
      <span className="absolute -top-[6px] left-6 h-[7px] w-7 rounded-t-[3px] bg-[var(--brick)]" aria-hidden />
      <span className="absolute -top-[6px] left-[68px] h-[7px] w-7 rounded-t-[3px] bg-[var(--brick)]" aria-hidden />
      <div
        className={`overflow-hidden rounded-[10px] border bg-surface shadow-[inset_0_-2px_0_rgb(0_0_0/0.06),0_6px_16px_-10px_rgb(23_32_51/0.45)] transition-[box-shadow,border-color] duration-150 ${
          selected ? "border-action" : "border-line-strong"
        } ${status?.ring ?? ""}`}
      >
        <div className="h-[6px] bg-[var(--brick)]" />
        <div className="flex items-start gap-2.5 px-3 py-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--brick)_16%,transparent)] text-[var(--brick)]">
            <NodeIcon name={def?.icon ?? "Hash"} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-bold leading-tight text-ink">{data.node.label || def?.title || data.node.type}</p>
            <p className="truncate text-xs text-ink-3">{data.node.label ? def?.title : def ? CATEGORY_META[def.category].title : "Unknown"}</p>
          </div>
        </div>
        {(status || data.issueCount > 0) && (
          <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[0.6875rem] font-semibold">
            {status ? <span className={status.tone}>{status.label}</span> : <span />}
            {data.issueCount > 0 && <span className="text-danger">{data.issueCount} to fix</span>}
          </div>
        )}
      </div>

      {(def?.inputs ?? []).map((p) => (
        <Handle key={p.id} id={p.id} type="target" position={Position.Left} className="!h-3.5 !w-3.5 !rounded-[4px] !border-2 !border-surface !bg-[var(--brick)]" />
      ))}
      {(def?.outputs ?? []).map((p, i, all) => {
        const top = multiOut ? `${((i + 1) / (all.length + 1)) * 100}%` : "50%";
        return (
          <div key={p.id}>
            <Handle id={p.id} type="source" position={Position.Right} style={{ top }} className="!h-3.5 !w-3.5 !rounded-[4px] !border-2 !border-surface !bg-[var(--brick)]" />
            {multiOut && (
              <span className="pointer-events-none absolute left-full ml-3 -translate-y-1/2 text-[0.6875rem] font-semibold text-ink-2" style={{ top }}>
                {p.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const BrickNode = memo(BrickNodeView);
