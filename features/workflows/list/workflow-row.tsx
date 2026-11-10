"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archive, ArrowCounterClockwise, Copy, Eye, ShareNetwork, SignOut, Trash, Users } from "@phosphor-icons/react";
import { relativeTime } from "@/lib/format";
import { nodeDefinition } from "@/lib/nodes/registry";
import { CATEGORY_META } from "@/lib/nodes/types";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import { BrickGlyph } from "@/features/workflows/node-icon";

// The card's thumbnail: the workflow's blocks on a little dotted canvas, in the order money
// flows, each in its category colour. The same footprint as a template's thumbnail, so your
// workflows and the templates below read as one list.
function CanvasThumb({ workflow, muted, stamp }: { workflow: WorkflowDTO; muted?: boolean; stamp?: string | null }) {
  const all = [...workflow.graph.nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const nodes = all.slice(0, 10);
  const more = all.length - nodes.length;
  return (
    <span className="relative block shrink-0">
    <span
      aria-hidden
      className={`flex aspect-[16/9] w-28 shrink-0 flex-wrap content-center items-center justify-center gap-1 overflow-hidden rounded-lg bg-surface p-2 shadow-[inset_0_0_0_1px_var(--line)] [background-image:radial-gradient(var(--line-strong)_0.6px,transparent_0.6px)] [background-size:8px_8px] sm:w-32 ${
        muted ? "opacity-60 grayscale" : ""
      }`}
    >
      {nodes.length === 0 ? (
        <span className="text-[0.6875rem] font-semibold text-ink-3">Empty</span>
      ) : (
        <>
          {nodes.map((n) => {
            const def = nodeDefinition(n.type);
            return <BrickGlyph key={n.id} name={def?.icon ?? "Package"} color={def ? CATEGORY_META[def.category].color : "var(--ink-3)"} size="xs" />;
          })}
          {more > 0 && <span className="num rounded bg-paper px-1 text-[0.625rem] font-bold text-ink-2 shadow-[0_0_0_1px_var(--line)]">+{more}</span>}
        </>
      )}
    </span>
      {/* A stamp on the corner of the thumbnail, the way a shared file is marked. */}
      {stamp && (
        <span className="absolute -top-1.5 -left-1.5 inline-flex -rotate-6 items-center gap-1 rounded-md bg-[var(--brick-1)] px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white shadow-[0_2px_6px_-1px_rgb(44_75_214/0.45),0_0_0_2px_var(--paper)]">
          <Users size={10} weight="bold" aria-hidden />
          {stamp}
        </span>
      )}
    </span>
  );
}

// "Shared with Neha Prasad and 1 more" from names (people who joined) and pending invites;
// never an email address. `full` lists every name, for the hover title.
function sharedLine({ names, invited }: { names: string[]; invited: number }, full: boolean): string {
  const pending = invited ? `${invited} ${invited === 1 ? "person" : "people"} invited` : "";
  if (!names.length) return pending ? `Shared · ${pending}` : "Shared";
  if (full) return `Shared with ${names.join(", ")}${pending ? `, plus ${pending}` : ""}`;
  const more = names.length - 1 + invited;
  return `Shared with ${names[0]}${more > 0 ? ` and ${more} more` : ""}`;
}

interface Props {
  workflow: WorkflowDTO;
  busy: boolean;
  sharedWith?: number;
  sharedPeople?: { names: string[]; invited: number };
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onShare: () => void;
  onLeave: () => void;
}

export function WorkflowRow({ workflow: w, busy, sharedWith = 0, sharedPeople, onDuplicate, onArchive, onRestore, onDelete, onShare, onLeave }: Props) {
  const archived = w.status === "archived";
  // Shared with you (view or edit): the owner's workflow, so no run stats and no archive.
  const viewer = w.access.role !== "owner";
  const trigger = w.triggerType ? nodeDefinition(w.triggerType)?.title.toLowerCase() : "no trigger";
  const meta = viewer
    ? `Shared by ${w.access.ownerName ?? "another member"}. ${w.access.can.edit ? "You can edit it" : "View only"}, updated ${relativeTime(w.updatedAt)}.`
    : archived
      ? `Archived ${relativeTime(w.updatedAt)}. ${w.runCount ? `${w.runCount} ${w.runCount === 1 ? "run" : "runs"} kept in history.` : "Never run."}`
      : `${w.graph.nodes.length} nodes, ${trigger}. ${w.runCount ? `Ran ${relativeTime(w.lastRunAt)}.` : "Not run yet."}`;

  const href = `/workflows/${w.id}`;
  return (
    <li className="group flex items-center gap-4 rounded-2xl bg-paper p-2.5 shadow-[0_0_0_1px_var(--line)] transition-shadow duration-150 hover:shadow-[0_0_0_1px_var(--line-strong),0_8px_20px_-14px_rgb(9_9_11/0.25)]">
      <Link href={href} tabIndex={-1} aria-hidden>
        <CanvasThumb workflow={w} muted={archived} stamp={viewer || sharedWith > 0 ? "Shared" : null} />
      </Link>
      <div className="min-w-0 flex-1">
        <h3 className="flex min-w-0 items-center gap-2 font-semibold leading-snug">
          {viewer ? (
            <Eye size={14} className="shrink-0 text-ink-3" aria-label="View only" />
          ) : archived ? (
            <Archive size={14} className="shrink-0 text-ink-3" aria-label="Archived" />
          ) : (
            <span className={`h-2 w-2 shrink-0 rounded-full ${w.enabled ? "bg-success" : "bg-line-strong"}`} title={w.enabled ? "On" : "Off"} aria-label={w.enabled ? "On" : "Off"} />
          )}
          <Link href={href} className={`truncate hover:underline ${archived ? "text-ink-2" : "text-ink"}`} title={w.name}>
            {w.name}
          </Link>

        </h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{meta}</p>
        {!viewer && sharedPeople && sharedPeople.names.length + sharedPeople.invited > 0 ? (
          <p className="mt-1.5 flex min-w-0 items-center gap-1 text-xs font-semibold text-[var(--brick-1)]" title={sharedLine(sharedPeople, true)}>
            <Users size={12} aria-hidden className="shrink-0" />
            <span className="truncate">{sharedLine(sharedPeople, false)}</span>
          </p>
        ) : !viewer && !archived ? (
          <p className="mt-1.5 text-xs font-semibold text-ink-3">{w.enabled ? "On, runs when triggered" : "Off, turn it on in the editor"}</p>
        ) : null}
      </div>
      <span className="flex shrink-0 items-center gap-0.5">
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
      className="press inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-50"
    >
      {children}
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
      title={armed ? undefined : "Delete"}
      className={`press inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors duration-150 disabled:opacity-50 ${
        armed ? "bg-danger text-white" : "text-danger hover:bg-danger-wash"
      }`}
    >
      <Trash size={16} aria-hidden />
      {armed && <span>Delete for good</span>}
    </button>
  );
}
