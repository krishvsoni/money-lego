// Upserts the published templates by slug. Idempotent: running it again changes
// nothing unless a definition changed. The app also runs the same seed lazily on first
// use, so this is for deploys and CI that want the data in place up front.
// Usage: npm run db:seed

import { collections } from "@/server/db/collections";
import { mongoClient } from "@/server/db/client";
import { env } from "@/server/config/env";
import { seedTemplates } from "@/server/templates/seed";

async function main() {
  const target = new URL(env().MONGODB_URI.replace(/^mongodb(\+srv)?:/, "http:"));
  console.log(`Seeding templates into ${target.hostname}/${env().MONGODB_DB}`);
  const report = await seedTemplates(await collections());
  console.log(`written: ${report.written.join(", ") || "none"}`);
  console.log(`unchanged: ${report.unchanged.join(", ") || "none"}`);
  console.log(`unpublished: ${report.unpublished}`);
  const { workflowTemplates } = await collections();
  console.log(`published templates: ${await workflowTemplates.countDocuments({ isPublished: true })}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoClient().close());
