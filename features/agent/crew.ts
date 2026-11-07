// Sage's crew as the panel shows it. Ids and order match server/agent/draft.ts, which
// runs them; the colours come from the brick palette so each one is easy to tell apart.

export type CrewId = "planner" | "guard" | "fixer" | "connector" | "builder";
export type CrewStatus = "waiting" | "working" | "done" | "skipped" | "failed";

export interface CrewMember {
  id: CrewId;
  name: string;
  job: string;
  tint: string;
}

export const CREW: CrewMember[] = [
  { id: "planner", name: "Planner", job: "Reads your request and picks the blocks", tint: "var(--brick-5)" },
  { id: "guard", name: "Guard", job: "Checks that every PayPal money action sits behind an approval", tint: "var(--brick-3)" },
  { id: "fixer", name: "Fixer", job: "Repairs anything Guard flags", tint: "var(--brick-2)" },
  { id: "connector", name: "Connector", job: "Links accounts you've already connected", tint: "var(--brick-6)" },
  { id: "builder", name: "Builder", job: "Lays out the canvas and saves it, turned off", tint: "var(--brick-4)" },
];

export type CrewState = Record<CrewId, { status: CrewStatus; detail?: string }>;

export const idleCrew = (): CrewState =>
  Object.fromEntries(CREW.map((m) => [m.id, { status: "waiting" as const }])) as CrewState;
