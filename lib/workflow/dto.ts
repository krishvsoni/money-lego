// Re-exported wire types so client code never imports from server modules.
export type { WorkflowDTO } from "@/server/workflows/service";
export type { RunDTO, NodeRunDTO } from "@/server/engine/runs";
export type { CredentialDTO } from "@/server/workflows/credentials";
export type { TemplateCardDTO, TemplateDetailDTO } from "@/server/templates/service";
