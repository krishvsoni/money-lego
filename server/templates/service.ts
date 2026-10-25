import "server-only";
import type { TemplateDefinition } from "@/lib/templates/types";
import type { WorkflowGraph } from "@/lib/workflow/types";
import { collections } from "../db/collections";
import type { WorkflowTemplateDoc } from "../db/types";
import { errors } from "../errors";
import { log } from "../log";
import { seedTemplates } from "./seed";

export type TemplateCardDTO = Pick<
  TemplateDefinition,
  "slug" | "name" | "shortDescription" | "category" | "difficulty" | "estimatedSetupMinutes" | "integrations" | "tags" | "thumbnailAlt"
> & { id: string; thumbnailUrl: string; nodeCount: number; revision: number };

export type TemplateDetailDTO = TemplateCardDTO &
  Pick<TemplateDefinition, "fullDescription" | "useCase" | "howItWorks" | "exampleScenario" | "exampleRun" | "requiredConnections" | "setupChecklist" | "safetyNotes"> & {
    graphSchemaVersion: number;
    graphDefinition: WorkflowGraph;
  };

function toCard(d: WorkflowTemplateDoc): TemplateCardDTO {
  return {
    id: d._id.toHexString(),
    slug: d.slug,
    name: d.name,
    shortDescription: d.shortDescription,
    category: d.category,
    difficulty: d.difficulty,
    estimatedSetupMinutes: d.estimatedSetupMinutes,
    integrations: d.integrations,
    tags: d.tags,
    thumbnailUrl: d.thumbnailUrl,
    thumbnailAlt: d.thumbnailAlt,
    nodeCount: d.graphDefinition?.nodes.length ?? 0,
    revision: d.revision,
  };
}

function toDetail(d: WorkflowTemplateDoc): TemplateDetailDTO {
  return {
    ...toCard(d),
    fullDescription: d.fullDescription,
    useCase: d.useCase,
    howItWorks: d.howItWorks,
    exampleScenario: d.exampleScenario,
    exampleRun: d.exampleRun,
    requiredConnections: d.requiredConnections,
    setupChecklist: d.setupChecklist,
    safetyNotes: d.safetyNotes,
    graphSchemaVersion: d.graphSchemaVersion,
    graphDefinition: d.graphDefinition,
  };
}

// Each instance makes sure the published set matches the seed source once per process.
// The seed is idempotent and race-safe, so many instances starting together is fine. A
// failure is logged and retried on the next request; reads still serve what's stored.
let ensured: Promise<void> | null = null;
function ensureSeeded(): Promise<void> {
  ensured ??= collections()
    .then((c) => seedTemplates(c))
    .then((r) => {
      if (r.written.length || r.unpublished) log.info("templates.seeded", { written: r.written, unpublished: r.unpublished });
    })
    .catch((error) => {
      ensured = null;
      log.error("templates.seed_failed", { error });
    });
  return ensured;
}

const SLUG = /^[a-z0-9-]{3,60}$/;

export async function listTemplates(): Promise<TemplateCardDTO[]> {
  await ensureSeeded();
  const { workflowTemplates } = await collections();
  const docs = await workflowTemplates.find({ isPublished: true }).sort({ createdAt: 1, slug: 1 }).limit(100).toArray();
  return docs.map(toCard);
}

export async function getTemplateDoc(slug: string): Promise<WorkflowTemplateDoc> {
  if (!SLUG.test(slug)) throw errors.notFound("Template");
  await ensureSeeded();
  const { workflowTemplates } = await collections();
  const doc = await workflowTemplates.findOne({ slug, isPublished: true });
  if (!doc) throw errors.notFound("Template");
  return doc;
}

export async function getTemplate(slug: string): Promise<TemplateDetailDTO> {
  return toDetail(await getTemplateDoc(slug));
}
