import { z } from "zod";
import { nodeDefinition } from "../nodes/registry";
import type { WorkflowGraph } from "./types";

// Who may do what with a workflow. One table, read by the server to authorize a request and
// by the browser (through `access.can`) to decide what to show, so the two can't disagree.
//
// A workflow has exactly one owner: runs use the owner's connections and PayPal identity, so
// "ownership" is handed over (a transfer), never held by two people at once. Everyone else it
// is shared with is a viewer or an editor. Editors change the workflow itself (blocks,
// settings, Sage edits); running it, turning it on, sharing it and archiving it stay with the
// owner, because those spend the owner's money and use the owner's connections.

export type WorkflowRole = "owner" | "editor" | "viewer";
export type ShareRole = "viewer" | "editor";
export type WorkflowAction = "view" | "copy" | "edit" | "run" | "share";

const GRANTS: Record<WorkflowRole, readonly WorkflowAction[]> = {
  owner: ["view", "copy", "edit", "run", "share"],
  editor: ["view", "copy", "edit"],
  viewer: ["view", "copy"],
};

export const can = (role: WorkflowRole, action: WorkflowAction): boolean => GRANTS[role].includes(action);

export interface WorkflowAccessDTO {
  role: WorkflowRole;
  can: { edit: boolean; copy: boolean; run: boolean; share: boolean };
  // Who shared it; null on your own workflows.
  ownerName: string | null;
}

export const accessFor = (role: WorkflowRole, ownerName: string | null = null): WorkflowAccessDTO => ({
  role,
  can: { edit: can(role, "edit"), copy: can(role, "copy"), run: can(role, "run"), share: can(role, "share") },
  ownerName: role === "owner" ? null : ownerName,
});

export const MAX_SHARES = 25;

// Addresses are compared lower-cased everywhere, so "Maya@Studio.com" is one person.
export const shareEmailSchema = z.string().trim().toLowerCase().max(254, "That email address is too long.").pipe(z.email("Enter a valid email address."));

export interface ShareDTO {
  id: string;
  email: string;
  role: ShareRole;
  // "pending" until someone signs in to Money Lego with that address.
  status: "active" | "pending";
  createdAt: string;
}

export interface SharingDTO {
  owner: { name: string; email: string | null };
  shares: ShareDTO[];
  limit: number;
}

// Connections belong to the person who made them. A graph that leaves its owner (a viewer's
// copy, a viewer's read-only view, an ownership transfer) has every connection slot emptied.
export const shareRoleSchema = z.enum(["viewer", "editor"]);

// An editor never sees the owner's connections, so a graph saved by an editor arrives with
// empty connection slots (or slots pointing at the editor's own accounts, which runs as the
// owner could never use). Every slot is put back to what the owner had, by node id; new
// nodes start with none for the owner to pick.
export function keepOwnerCredentials(saved: WorkflowGraph, current: WorkflowGraph): WorkflowGraph {
  const before = new Map(current.nodes.map((n) => [n.id, n]));
  return {
    ...saved,
    nodes: saved.nodes.map((n) => {
      const slots = nodeDefinition(n.type)?.fields.filter((f) => f.kind === "credential") ?? [];
      if (!slots.length) return n;
      const config = { ...n.config };
      const prev = before.get(n.id);
      for (const f of slots) {
        if (prev && prev.type === n.type && f.key in prev.config) config[f.key] = prev.config[f.key];
        else delete config[f.key];
      }
      return { ...n, config };
    }),
  };
}

export function withoutCredentials(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const slots = nodeDefinition(n.type)?.fields.filter((f) => f.kind === "credential" && f.key in n.config) ?? [];
      if (!slots.length) return n;
      const config = { ...n.config };
      for (const f of slots) delete config[f.key];
      return { ...n, config };
    }),
  };
}
