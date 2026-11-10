"use client";

import Link from "next/link";
import { ArrowLeft, Copy, Eye, Pencil, Play, Redo2, Share2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Editor, SaveState } from "./use-workflow-editor";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving",
  conflict: "Changed elsewhere",
  error: "Not saved",
};

export function Toolbar({
  editor,
  onTest,
  testing,
  onToggleEnabled,
  toggling,
  onShare,
  onCopy,
  copying,
}: {
  editor: Editor;
  onTest: () => void;
  testing: boolean;
  onToggleEnabled: () => void;
  toggling: boolean;
  onShare: () => void;
  onCopy: () => void;
  copying: boolean;
}) {
  const { workflow, saveState, issues } = editor;
  const blocked = issues.length > 0;
  if (editor.readOnly) {
    return (
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link href="/workflows?shelf=shared" className="press rounded-md p-2 text-ink-2 hover:bg-sunken hover:text-ink" aria-label="Shared workflows">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 max-w-[340px] truncate px-2 text-[0.9375rem] font-bold">{workflow.name}</h1>
        <span className="hidden items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-ink-2 sm:inline-flex">
          <Eye className="h-3.5 w-3.5" aria-hidden />
          View only{workflow.access.ownerName ? ` · shared by ${workflow.access.ownerName}` : ""}
        </span>
        <Button className="ml-auto" onClick={onCopy} busy={copying} title="Make your own editable copy">
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Make a copy
        </Button>
      </header>
    );
  }
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <Link href={workflow.access.role === "owner" ? "/workflows" : "/workflows?shelf=shared"} className="press rounded-md p-2 text-ink-2 hover:bg-sunken hover:text-ink" aria-label="All workflows">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <input
        aria-label="Workflow name"
        value={editor.name}
        onChange={(e) => editor.rename(e.target.value)}
        maxLength={80}
        className="min-w-0 max-w-[340px] flex-1 rounded-md bg-transparent px-2 py-1 text-[0.9375rem] font-bold outline-none hover:bg-sunken focus:bg-sunken"
      />
      <span className={`hidden text-xs sm:inline ${saveState === "conflict" || saveState === "error" ? "text-danger" : "text-ink-3"}`} aria-live="polite" title={editor.saveError ?? undefined}>
        {SAVE_LABEL[saveState]}
        {saveState === "conflict" && (
          <button onClick={() => window.location.reload()} className="ml-2 font-semibold underline">
            Reload
          </button>
        )}
      </span>

      {workflow.access.role === "editor" && (
        <span
          className="hidden items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-ink-2 lg:inline-flex"
          title="You can change this workflow. Its owner runs it and turns it on."
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Can edit{workflow.access.ownerName ? ` · ${workflow.access.ownerName}'s workflow` : ""}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button onClick={editor.undo} disabled={!editor.canUndo} className="press rounded-md p-2 text-ink-2 hover:bg-sunken disabled:opacity-30" aria-label="Undo" title="Undo (⌘Z)">
          <Undo2 className="h-4 w-4" />
        </button>
        <button onClick={editor.redo} disabled={!editor.canRedo} className="press rounded-md p-2 text-ink-2 hover:bg-sunken disabled:opacity-30" aria-label="Redo" title="Redo (⇧⌘Z)">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <button
        onClick={() => editor.setSelectedId(issues.find((i) => i.nodeId)?.nodeId ?? null)}
        className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold md:inline ${blocked ? "bg-danger-wash text-danger" : "bg-success-wash text-success"}`}
      >
        {blocked ? `${issues.length} to fix` : "Ready"}
      </button>

      {/* A div, not a label: a label around a button re-fires the click and selects the text on double-click. */}
      {workflow.access.can.run && (
        <div className="mr-1 flex shrink-0 select-none items-center gap-2 text-xs font-semibold text-ink-2">
          <span className="hidden w-6 text-right sm:inline" aria-hidden>
            {workflow.enabled ? "On" : "Off"}
          </span>
          <button
            role="switch"
            aria-checked={workflow.enabled}
            aria-label={workflow.enabled ? "Turn workflow off" : "Turn workflow on"}
            onClick={onToggleEnabled}
            disabled={toggling}
            title={workflow.enabled ? "Triggers are live" : "Triggers are off. Test runs still work."}
            className={`press relative block h-6 w-10 shrink-0 overflow-hidden rounded-full p-0 transition-colors duration-150 disabled:opacity-60 ${workflow.enabled ? "bg-success" : "bg-line-strong"}`}
          >
            <span
              className="absolute left-0 top-0.5 block h-5 w-5 rounded-full bg-surface shadow transition-transform duration-200"
              style={{ transform: `translateX(${workflow.enabled ? 18 : 2}px)`, transitionTimingFunction: "var(--ease-out)" }}
            />
          </button>
        </div>
      )}

      {workflow.access.can.share && (
        <Button variant="secondary" onClick={onShare} title="Share with people by email">
          <Share2 className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Share</span>
        </Button>
      )}

      {workflow.access.can.run && (
        <Button onClick={onTest} busy={testing} disabled={blocked} title={blocked ? "Fix the listed issues first" : "Runs the saved workflow now"}>
          <Play className="h-3.5 w-3.5" aria-hidden />
          Test run
        </Button>
      )}
    </header>
  );
}
