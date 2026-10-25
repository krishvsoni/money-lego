import "server-only";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { thumbnailUrlFor, type TemplateDefinition } from "@/lib/templates/types";
import { validateTemplate } from "@/lib/templates/validate";
import { WORKFLOW_SCHEMA_VERSION } from "@/lib/workflow/types";
import { isDuplicateKeyError, type Collections } from "../db/collections";
import { TEMPLATE_DEFINITIONS } from "./definitions";

// Upserts the published templates by slug. Safe to run any number of times from any
// number of instances at once:
//  - unchanged content matches no document (the filter excludes the current hash), the
//    upsert's insert then hits the unique slug index, and that duplicate is the no-op;
//  - changed content updates in place and bumps the revision exactly once;
//  - a slug no longer defined is unpublished, never deleted, so imports keep their origin.

export function contentHash(def: TemplateDefinition): string {
  return createHash("sha256").update(JSON.stringify({ v: WORKFLOW_SCHEMA_VERSION, def })).digest("hex");
}

export interface SeedReport {
  written: string[];
  unchanged: string[];
  unpublished: number;
}

export async function seedTemplates(c: Pick<Collections, "workflowTemplates">, definitions: TemplateDefinition[] = TEMPLATE_DEFINITIONS): Promise<SeedReport> {
  const problems = definitions.flatMap((d) => validateTemplate(d).map((issue) => `${d.slug}: ${issue}`));
  if (problems.length) throw new Error(`Refusing to seed invalid templates:\n${problems.join("\n")}`);
  const slugs = definitions.map((d) => d.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error("Template slugs must be unique.");

  const report: SeedReport = { written: [], unchanged: [], unpublished: 0 };
  for (const def of definitions) {
    const hash = contentHash(def);
    const now = new Date();
    try {
      await c.workflowTemplates.updateOne(
        { slug: def.slug, contentHash: { $ne: hash } },
        {
          $set: { ...def, thumbnailUrl: thumbnailUrlFor(def.slug), graphSchemaVersion: WORKFLOW_SCHEMA_VERSION, isPublished: true, contentHash: hash, updatedAt: now },
          $inc: { revision: 1 },
          $setOnInsert: { _id: new ObjectId(), createdAt: now },
        },
        { upsert: true },
      );
      report.written.push(def.slug);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      report.unchanged.push(def.slug);
    }
  }
  const stale = await c.workflowTemplates.updateMany({ slug: { $nin: slugs }, isPublished: true }, { $set: { isPublished: false, updatedAt: new Date() } });
  report.unpublished = stale.modifiedCount;
  return report;
}
