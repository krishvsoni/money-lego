// End-to-end smoke test against a running server. It writes data, so it refuses to run
// unless the server's database is the expected local replica set.
// Usage: BASE_URL=http://localhost:3100 SMOKE_OPERATOR_SECRET=<CRON_SECRET> bun scripts/smoke.ts

import { check, Client, failureCount } from "./smoke/client";
import { engineChecks } from "./smoke/engine";
import { securityChecks } from "./smoke/security";

async function main() {
  const operator = process.env.SMOKE_OPERATOR_SECRET;
  if (!operator) {
    console.error("Set SMOKE_OPERATOR_SECRET to the server's CRON_SECRET.");
    process.exit(2);
  }
  const health = await new Client().call("/api/health", { headers: { authorization: `Bearer ${operator}` } });
  const expectedSet = process.env.SMOKE_REPLICA_SET ?? "rs0";
  if (health.json?.db?.replicaSet !== expectedSet) {
    console.error(`Refusing to run: server is on replica set "${health.json?.db?.replicaSet}", expected "${expectedSet}". This test writes data.`);
    process.exit(2);
  }
  check("health reports a writable primary", health.json?.db?.primary === true);

  const { alice } = await securityChecks();
  await engineChecks(alice, operator);

  console.log(failureCount() ? `\n${failureCount()} check(s) failed` : "\nAll checks passed");
  process.exit(failureCount() ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
