"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archive, ArrowCounterClockwise, Copy, Eye, ShareNetwork, SignOut, Trash, Users } from "@phosphor-icons/react";
import { relativeTime } from "@/lib/format";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import { BrickGlyph } from "@/features/workflows/node-icon";

// A row of node icons in their category colour: the workflow's shape at a glance.
function BrickStrip({ workflow, muted }: { workflow: WorkflowDTO; muted?: boolean }) {
  const nodes = [...workflow.graph.nodes].sort((a, b) => a.position.x - b.position.x).slice(0, 12);
  if (!nodes.length) return <span className="text-xs text-ink-3">Empty</span>;
  return (
    <span className={`hidden items-center gap-[3px] md:flex ${muted ? "opacity-50 grayscale" : ""}`} aria-hidden>
      {nodes.map((n) => {
        const def = nodeDefinition(n.type);
        return <BrickGlyph key={n.id} name={def?.icon ?? "Package"} color={def ? CATEGORY_META[def.category].color : "var(--ink-3)"} size="xs" />;
      })}
    </span>
  );
}

interface Props {
  workflow: WorkflowDTO;
  busy: boolean;
  sharedWith?: number;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onShare: () => void;
  onLeave: () => void;
}

export function WorkflowRow({ workflow: w, busy, sharedWith = 0, onDuplicate, onArchive, onRestore, onDelete, onShare, onLeave }: Props) {
  const archived = w.status === "archived";
  const viewer = w.access.role === "viewer";
  const trigger = w.triggerType ? nodeDefinition(w.triggerType)?.title.toLowerCase() : "no trigger";
  const meta = viewer
    ? `Shared by ${w.access.ownerName ?? "another member"}. View only, updated ${relativeTime(w.updatedAt)}.`
    : archived
      ? `Archived ${relativeTime(w.updatedAt)}. ${w.runCount ? `${w.runCount} ${w.runCount === 1 ? "run" : "runs"} kept in history.` : "Never run."}`
      : `${w.graph.nodes.length} nodes, ${trigger}. ${w.runCount ? `Ran ${relativeTime(w.lastRunAt)}.` : "Not run yet."}`;

  return (
    <li className="group flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl px-3 py-4 transition-colors duration-150 hover:bg-surface">
      <Link href={`/workflows/${w.id}`} className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brick-1)]">
        <span className="flex items-center gap-2">
          {viewer ? (
            <Eye size={14} className="shrink-0 text-ink-3" aria-label="View only" />
          ) : archived ? (
            <Archive size={14} className="shrink-0 text-ink-3" aria-label="Archived" />
          ) : (
            <span className={`h-2 w-2 shrink-0 rounded-full ${w.enabled ? "bg-success" : "bg-line-strong"}`} title={w.enabled ? "On" : "Off"} />
          )}
          <span className={`truncate font-bold ${archived ? "text-ink-2" : "group-hover:text-action"}`}>{w.name}</span>
          {sharedWith > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-ink-2" title={`Shared with ${sharedWith} ${sharedWith === 1 ? "person" : "people"}`}>
              <Users size={12} aria-hidden />
              <span className="num">{sharedWith}</span>
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-ink-2">{meta}</span>
      </Link>
      <BrickStrip workflow={w} muted={archived} />
      <span className="flex items-center gap-1">
        {viewer ? (
          <>
            <IconButton label="Make a copy" onClick={onDuplicate} disabled={busy}>
              <Copy size={16} aria-hidden />
            </IconButton>
            <IconButton label="Leave" onClick={onLeave} disabled={busy}>
              <SignOut size={16} aria-hidden />
            </IconButton>
          </>
        ) : archived ? (
          <>
            <IconButton label="Restore" onClick={onRestore} disabled={busy}>
              <ArrowCounterClockwise size={16} aria-hidden />
            </IconButton>
            <ConfirmDelete name={w.name} onConfirm={onDelete} disabled={busy} />
          </>
        ) : (
          <>
            <IconButton label="Share" onClick={onShare} disabled={busy}>
              <ShareNetwork size={16} aria-hidden />
            </IconButton>
            <IconButton label="Duplicate" onClick={onDuplicate} disabled={busy}>
              <Copy size={16} aria-hidden />
            </IconButton>
            <IconButton label="Archive" onClick={onArchive} disabled={busy}>
              <Archive size={16} aria-hidden />
            </IconButton>
          </>
        )}
      </span>
    </li>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-50"
    >
      {children}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

// Two clicks to delete: the first arms the button and says exactly what will happen, the
// second deletes. It disarms on its own after a few seconds or when focus leaves.
function ConfirmDelete({ name, onConfirm, disabled }: { name: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      disabled={disabled}
      aria-label={armed ? `Confirm: delete ${name} for good` : `Delete ${name}`}
      className={`press inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-50 ${
        armed ? "bg-danger text-white" : "text-danger hover:bg-danger-wash"
      }`}
    >
      <Trash size={16} aria-hidden />
      <span className={armed ? "inline" : "hidden lg:inline"}>{armed ? "Delete for good" : "Delete"}</span>
    </button>
  );
}
