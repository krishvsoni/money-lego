import type { CredentialType } from "../nodes/types";
import type { WorkflowGraph } from "../workflow/types";

// The shape of a prebuilt workflow template, shared by the seed source, the API's wire
// types and the validator. The graph is a real workflow graph in the current schema.

export type Difficulty = "Beginner" | "Intermediate" | "Advanced";

export interface TemplateStepOutput {
  nodeId: string;
  label: string;
  exampleOutput: unknown;
}

export interface TemplateScenario {
  headline: string;
  narrative: string;
  sampleInput: Record<string, unknown>;
  expectedStepOutputs: TemplateStepOutput[];
  safetyNotes: string[];
  dryRun: true;
}

export interface TemplateExampleRun {
  dryRun: true;
  label: string;
  steps: Array<{ nodeId: string; status: "would_run" | "would_wait" | "would_stop"; note: string }>;
}

export interface TemplateConnection {
  provider: string;
  credentialType: CredentialType | null;
  nodeIds: string[];
  fields: string[];
  why: string;
}

export interface TemplateChecklistItem {
  id: string;
  title: string;
  detail: string;
  nodeIds: string[];
}

export interface TemplateDefinition {
  slug: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  useCase: string;
  howItWorks: string[];
  category: string;
  difficulty: Difficulty;
  estimatedSetupMinutes: { min: number; max: number };
  integrations: string[];
  tags: string[];
  thumbnailAlt: string;
  graphDefinition: WorkflowGraph;
  exampleScenario: TemplateScenario;
  exampleRun: TemplateExampleRun;
  requiredConnections: TemplateConnection[];
  setupChecklist: TemplateChecklistItem[];
  safetyNotes: string[];
}

export const thumbnailUrlFor = (slug: string) => `/templates/${slug}.svg`;
export const TEMPLATE_FALLBACK_THUMBNAIL = "/templates/fallback.svg";
