import { createHmac } from "node:crypto";
import { BASE, check, Client, randomWallet, sleep, type Json } from "./client";

const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const edge = (source: string, target: string, sourcePort = "main") => ({ id: `${source}-${target}`, source, sourcePort, target, targetPort: "main" });
const at = (i: number) => ({ x: i * 280, y: 0 });

async function workflow(c: Client, name: string, nodes: Json[], edges: Json[]) {
  const wf = (await c.call("/api/workflows", { body: { templateId: "blank", name } })).json.workflow;
  const saved = await c.call(`/api/workflows/${wf.id}`, { method: "PUT", body: { name, expectedVersion: wf.version, graph: { schemaVersion: 1, nodes, edges } } });
  if (saved.status !== 200) throw new Error(`save failed: ${JSON.stringify(saved.json)}`);
  return saved.json.workflow;
}

const run = async (c: Client, id: string, advance = false) => (await c.call(`/api/workflow-runs/${id}${advance ? "?advance=1" : ""}`)).json.run;
const node = (r: Json, id: string) => r.nodes.find((n: Json) => n.nodeId === id);

function signed(secret: string, body: object, key?: string) {
  const raw = JSON.stringify(body);
  return { raw, headers: { "x-money-lego-signature": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`, ...(key ? { "idempotency-key": key } : {}) } };
}

export async function engineChecks(alice: Client, operatorSecret: string) {
  const secret = await alice.call("/api/credentials", { body: { type: "webhook_secret", name: "Engine" } });
  const credentialId = secret.json.credential.id;
  const signingSecret: string = secret.json.revealOnce;
  const wallets = [randomWallet(), randomWallet(), randomWallet()];

  const wf = await workflow(
    alice,
    "Webhook approval",
    [
      { id: "hook", type: "trigger.webhook", position: at(0), config: { credentialId } },
      { id: "validate", type: "data.validate", position: at(1), config: { rules: [{ path: "body.type", type: "string" }, { path: "body.amount", type: "string" }] } },
      { id: "cond", type: "logic.condition", position: at(2), config: { left: "{{ input.body.type }}", operator: "equals", right: "payout.requested" } },
      { id: "split", type: "data.split", position: at(3), config: { tokenMint: USDC_DEVNET, mode: "percent", total: "{{ input.body.amount }}", recipients: wallets.map((w, i) => ({ wallet: w, share: ["33.33", "33.33", "33.34"][i], label: `R${i}` })) } },
      { id: "approve", type: "logic.approval", position: at(4), config: { message: "Pay {{ input.amount }} USDC?", timeoutHours: 1 } },
      { id: "done", type: "util.log", position: at(5), config: { message: "Approved {{ input.amountRaw }}" } },
      { id: "declined", type: "util.log", position: { x: 1400, y: 170 }, config: { message: "Declined" } },
      { id: "ignored", type: "util.log", position: { x: 840, y: 170 }, config: { message: "Not a payout" } },
    ],
    [edge("hook", "validate"), edge("validate", "cond"), edge("cond", "split", "true"), edge("cond", "ignored", "false"), edge("split", "approve"), edge("approve", "done", "approved"), edge("approve", "declined", "rejected")],
  );
  const hook = `/api/hooks/${wf.webhookPath.split("/").pop()}`;

  const off = signed(signingSecret, { type: "payout.requested", amount: "100" });
  check("a disabled workflow's webhook looks nonexistent (404)", (await alice.call(hook, { raw: off.raw, headers: off.headers })).status === 404);
  check("turning on a valid workflow works", (await alice.call(`/api/workflows/${wf.id}/enabled`, { body: { enabled: true } })).json?.workflow?.enabled === true);

  const anon = new Client();
  const bad = await anon.call(hook, { raw: off.raw, headers: { "x-money-lego-signature": `sha256=${"0".repeat(64)}` } });
  check("a forged webhook signature is refused", bad.status === 403);
  check("an unknown hook key is 404", (await anon.call("/api/hooks/AAAAAAAAAAAAAAAAAAAAAAAA", { raw: off.raw, headers: off.headers })).status === 404);

  const delivery = signed(signingSecret, { type: "payout.requested", amount: "100" }, "delivery-0001");
  const first = await anon.call(hook, { raw: delivery.raw, headers: delivery.headers });
  check("a signed webhook starts a run (202)", first.status === 202 && first.json?.runId, first.json);
  const again = await anon.call(hook, { raw: delivery.raw, headers: delivery.headers });
  check("redelivery returns the same run, not a second payout", again.status === 200 && again.json?.duplicate === true && again.json?.runId === first.json.runId, again.json);

  let r = await run(alice, first.json.runId);
  check("the run pauses at approval", r.status === "waiting" && r.waiting?.kind === "approval" && r.waiting?.nodeId === "approve", { status: r.status, waiting: r.waiting, error: r.error });
  const split = node(r, "split")?.output;
  const total = (split?.destinations ?? []).reduce((a: bigint, d: Json) => a + BigInt(d.amountRaw), 0n);
  check("split is exact to the base unit (100 USDC, 33.33/33.33/33.34)", split?.amountRaw === "100000000" && total === 100_000_000n && split?.destinations[2].amountRaw === "33340000", split);
  check("the approval message resolved its expression", node(r, "approve")?.waitState?.message === "Pay 100 USDC?", node(r, "approve"));

  const decided = await alice.call(`/api/workflow-runs/${r.id}/approve`, { body: { nodeId: "approve", decision: "approved" } });
  r = decided.json?.run;
  check("approving resumes and finishes the run", r?.status === "succeeded", { status: r?.status, error: r?.error });
  check("the approved branch ran and the others were skipped", node(r, "done")?.status === "succeeded" && node(r, "declined")?.status === "skipped" && node(r, "ignored")?.status === "skipped");
  check("deciding twice is refused", (await alice.call(`/api/workflow-runs/${r.id}/approve`, { body: { nodeId: "approve", decision: "rejected" } })).status === 409);

  const other = signed(signingSecret, { type: "refund.requested", amount: "5" });
  const otherRun = await run(alice, (await anon.call(hook, { raw: other.raw, headers: other.headers })).json.runId);
  check("the false branch runs and the payout branch is skipped", otherRun.status === "succeeded" && node(otherRun, "ignored")?.status === "succeeded" && node(otherRun, "split")?.status === "skipped");

  const broken = signed(signingSecret, { type: "payout.requested" });
  const brokenRun = await run(alice, (await anon.call(hook, { raw: broken.raw, headers: broken.headers })).json.runId);
  check("validation failures stop the run with a clear reason", brokenRun.status === "failed" && /body.amount must be string/.test(brokenRun.error ?? ""), brokenRun.error);

  const ssrf = await workflow(alice, "SSRF", [
    { id: "m", type: "trigger.manual", position: at(0), config: { samplePayload: "{}" } },
    { id: "h", type: "http.request", position: at(1), config: { method: "GET", url: "https://127.0.0.1/admin", timeoutSeconds: 3 } },
  ], [edge("m", "h")]);
  const ssrfRun = (await alice.call(`/api/workflows/${ssrf.id}/runs`, { body: { requestKey: crypto.randomUUID() } })).json.run;
  check("HTTP requests to internal addresses are blocked", ssrfRun.status === "failed" && /Private and internal/.test(ssrfRun.error ?? ""), ssrfRun.error);
  const retry = await alice.call(`/api/workflow-runs/${ssrfRun.id}/retry`, { body: {} });
  check("retrying a side-effecting step needs explicit confirmation", retry.status === 409, retry.json);

  const money = await workflow(alice, "Money", [
    { id: "m", type: "trigger.manual", position: at(0), config: { samplePayload: '{ "amount": "5" }' } },
    { id: "split", type: "data.split", position: at(1), config: { tokenMint: USDC_DEVNET, mode: "even", total: "{{ input.amount }}", recipients: [{ wallet: wallets[0], share: "", label: "" }] } },
    { id: "est", type: "mh.estimate", position: at(2), config: {} },
  ], [edge("m", "split"), edge("split", "est")]);
  const key = crypto.randomUUID();
  const moneyRun = (await alice.call(`/api/workflows/${money.id}/runs`, { body: { requestKey: key } })).json.run;
  check("MultiHopper steps fail safely when no API key is configured", moneyRun.status === "failed" && /not configured/i.test(moneyRun.error ?? ""), moneyRun.error);
  const sameRun = (await alice.call(`/api/workflows/${money.id}/runs`, { body: { requestKey: key } })).json.run;
  check("a double-clicked test run starts one run", sameRun.id === moneyRun.id);

  const waits = await workflow(alice, "Delay", [
    { id: "m", type: "trigger.manual", position: at(0), config: { samplePayload: '{ "n": 1 }' } },
    { id: "d", type: "util.delay", position: at(1), config: { minutes: 1 } },
    { id: "l", type: "util.log", position: at(2), config: { message: "woke with {{ input.n }}" } },
  ], [edge("m", "d"), edge("d", "l")]);
  const delayed = (await alice.call(`/api/workflows/${waits.id}/runs`, { body: { requestKey: crypto.randomUUID() } })).json.run;
  const cancelled = (await alice.call(`/api/workflows/${waits.id}/runs`, { body: { requestKey: crypto.randomUUID() } })).json.run;
  check("a delay pauses the run durably", delayed.status === "waiting" && delayed.waiting?.kind === "delay");
  const c = await alice.call(`/api/workflow-runs/${cancelled.id}/cancel`, { body: {} });
  check("cancelling a waiting run stops it", c.json?.run?.status === "cancelled" && node(c.json.run, "d")?.status === "cancelled");

  console.log("      waiting 62 s for the delay to elapse…");
  await sleep(62_000);
  const cron = await fetch(`${BASE}/api/cron/workflows`, { headers: { authorization: `Bearer ${operatorSecret}` } });
  const cronJson = await cron.json();
  check("the scheduler sweep resumes due runs with no browser involved", cron.status === 200 && cronJson.workflows?.advanced >= 1, cronJson);
  const resumed = await run(alice, delayed.id);
  check("the delayed run finished after the sweep", resumed.status === "succeeded" && resumed.log.some((l: Json) => l.message === "woke with 1"), { status: resumed.status, log: resumed.log.slice(-3) });
  check("the cancelled run stayed cancelled", (await run(alice, cancelled.id)).status === "cancelled");
  check("the scheduler refuses callers without the secret", (await fetch(`${BASE}/api/cron/workflows`)).status === 403);
}
