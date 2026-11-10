import { z } from "zod";
import { nodeDefinition } from "../nodes/registry";
import type { WorkflowGraph } from "./types";

// Who may do what with a workflow. One table, read by the server to authorize a request and
// by the browser (through `access.can`) to decide what to show, so the two can't disagree.
//
// A workflow has exactly one owner: runs use the owner's connections and PayPal identity, so
// "ownership" is handed over (a transfer), never held by two people at once. Everyone else
// it is shared with is a viewer.

export type WorkflowRole = "owner" | "viewer";
export type WorkflowAction = "view" | "copy" | "edit" | "share";

const GRANTS: Record<WorkflowRole, readonly WorkflowAction[]> = {
  owner: ["view", "copy", "edit", "share"],
  viewer: ["view", "copy"],
};

export const can = (role: WorkflowRole, action: WorkflowAction): boolean => GRANTS[role].includes(action);

export interface WorkflowAccessDTO {
  role: WorkflowRole;
  can: { edit: boolean; copy: boolean; share: boolean };
  // Who shared it; null on your own workflows.
  ownerName: string | null;
}

export const accessFor = (role: WorkflowRole, ownerName: string | null = null): WorkflowAccessDTO => ({
  role,
  can: { edit: can(role, "edit"), copy: can(role, "copy"), share: can(role, "share") },
  ownerName: role === "owner" ? null : ownerName,
});

export const MAX_SHARES = 25;

// Addresses are compared lower-cased everywhere, so "Maya@Studio.com" is one person.
export const shareEmailSchema = z.string().trim().toLowerCase().max(254, "That email address is too long.").pipe(z.email("Enter a valid email address."));

export interface ShareDTO {
  id: string;
  email: string;
  role: "viewer";
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
