// Removes everything left over from the Solana / MultiHopper (wallet) era of Money Lego:
// wallet accounts and their workflows, versions, runs, node runs, once-keys and credentials,
// leftover demo members, the unpublished MultiHopper templates, and the collections only the
// wallet era used. PayPal-era data (Clerk members, PayPal templates, paypal_* collections)
// is never touched.
//
// Dry run by default: prints what it would delete. Add --confirm to actually delete.
// Usage: npm run db:cleanup-wallet            (dry run)
//        npm run db:cleanup-wallet -- --confirm

import { MongoClient, type ObjectId } from "mongodb";

const LEGACY_COLLECTIONS = ["accounts", "users", "auth_nonces", "sessions", "recipes", "recipe_versions", "executions", "webhook_events", "migrations", "member_sessions", "login_states"];

async function main() {
  const confirm = process.argv.includes("--confirm");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || "money_lego");
    const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
    const ids = async (name: string, filter: object) => (existing.has(name) ? (await db.collection(name).find(filter, { projection: { _id: 1 } }).toArray()).map((d) => d._id as ObjectId) : []);

    const walletOwners = await ids("accounts", {});
    const demoOwners = await ids("members", { kind: { $ne: "clerk" } });
    const owners = [...walletOwners, ...demoOwners];
    const flows = await ids("workflows", { ownerId: { $in: owners } });
    const runs = await ids("workflow_runs", { workflowId: { $in: flows } });

    const plan: Array<[string, object]> = [
      ["node_runs", { runId: { $in: runs } }],
      ["workflow_runs", { _id: { $in: runs } }],
      ["workflow_versions", { workflowId: { $in: flows } }],
      ["once_keys", { workflowId: { $in: flows } }],
      ["workflows", { _id: { $in: flows } }],
      ["credentials", { ownerId: { $in: owners } }],
      ["members", { _id: { $in: demoOwners } }],
      ["workflow_templates", { isPublished: false, slug: { $not: /^paypal-/ } }],
    ];

    console.log(`${confirm ? "Deleting" : "Dry run, would delete"}: ${walletOwners.length} wallet account(s), ${demoOwners.length} demo member(s), ${flows.length} workflow(s), ${runs.length} run(s).`);
    for (const [name, filter] of plan) {
      if (!existing.has(name)) continue;
      const n = confirm ? (await db.collection(name).deleteMany(filter)).deletedCount : await db.collection(name).countDocuments(filter);
      console.log(`  ${name.padEnd(20)} ${n}`);
    }
    for (const name of LEGACY_COLLECTIONS.filter((n) => existing.has(n))) {
      const n = await db.collection(name).estimatedDocumentCount();
      if (confirm) await db.collection(name).drop();
      console.log(`  ${name.padEnd(20)} ${confirm ? "dropped" : "would drop"} (${n} docs)`);
    }
    if (!confirm) console.log("\nNothing was changed. Re-run with -- --confirm to delete.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed.");
  process.exitCode = 1;
});
