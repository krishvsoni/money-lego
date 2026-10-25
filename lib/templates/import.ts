import { nodeDefinition } from "../nodes/registry";
import { WORKFLOW_SCHEMA_VERSION, workflowGraphSchema, type WorkflowGraph } from "../workflow/types";
import { structuralIssues } from "./validate";

// Turns a shared template graph into a private copy for one person. The copy is a deep
// clone, so editing it can never touch the template, and every credential slot is emptied
// so the importer connects their own accounts. Positions, edges, labels and safe defaults
// carry over unchanged.

export class TemplateImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateImportError";
  }
}

export function cloneForImport(source: unknown, schemaVersion: number): WorkflowGraph {
  if (schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
    throw new TemplateImportError(`This template uses workflow format v${schemaVersion}; this app reads v${WORKFLOW_SCHEMA_VERSION}.`);
  }
  const parsed = workflowGraphSchema.safeParse(structuredClone(source));
  if (!parsed.success) throw new TemplateImportError("This template's graph is damaged, so it can't be imported.");
  const graph = parsed.data;
  const unknown = graph.nodes.find((n) => !nodeDefinition(n.type) || nodeDefinition(n.type)?.unavailable);
  if (unknown) throw new TemplateImportError(`This template needs a node this app doesn't have (${unknown.type}).`);
  const broken = structuralIssues(graph);
  if (broken.length) throw new TemplateImportError(`This template's graph is invalid: ${broken[0]}`);

  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const def = nodeDefinition(n.type)!;
      const config = { ...n.config };
      for (const f of def.fields) if (f.kind === "credential") delete config[f.key];
      return { ...n, config };
    }),
  };
}
