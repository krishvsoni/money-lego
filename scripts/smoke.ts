// End-to-end smoke test against a running server: real wallet-signature auth with
// generated keypairs, recipe CRUD, optimistic concurrency, ownership isolation, webhook
// rejection and run creation. Usage: BASE_URL=http://localhost:3000 bun scripts/smoke.ts

import bs58 from "bs58";
import nacl from "tweetnacl";
import { buildSignInMessage, type SignInPayload } from "../lib/auth-message";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
let failures = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed API responses in a test script
type Json = any;

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
}

class Client {
  cookie = "";
  async call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body === undefined && init.raw === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", cookie: this.cookie, ...init.headers },
      body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, json: (await res.json().catch(() => null)) as Json };
  }
}

async function signIn(client: Client) {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const nonce = await client.call("/api/auth/nonce", { body: { wallet } });
  const payload = nonce.json as SignInPayload;
  const sig = nacl.sign.detached(new TextEncoder().encode(buildSignInMessage(payload)), kp.secretKey);
  const verify = await client.call("/api/auth/verify", { body: { wallet, nonce: payload.nonce, signature: bs58.encode(sig) } });
  return { wallet, payload, sig, verify, kp };
}

const destinations = () =>
  Array.from({ length: 3 }, (_, i) => ({ wallet: bs58.encode(nacl.sign.keyPair().publicKey), amountRaw: String((i + 1) * 1_000_000), label: `R${i + 1}` }));

async function main() {
  const operator = process.env.SMOKE_OPERATOR_SECRET;
  if (!operator) {
    console.error("Set SMOKE_OPERATOR_SECRET to the server's CRON_SECRET so the database guard can read health details.");
    process.exit(2);
  }
  const health = await new Client().call("/api/health", { headers: { authorization: `Bearer ${operator}` } });
  const expectedSet = process.env.SMOKE_REPLICA_SET ?? "rs0";
  if (health.json?.db?.replicaSet !== expectedSet) {
    console.error(`Refusing to run: server is on replica set "${health.json?.db?.replicaSet}", expected "${expectedSet}". This test writes data.`);
    process.exit(2);
  }
  check("health reports a writable primary", health.json?.ok === true && health.json?.db?.primary === true, health.json);

  const anon = new Client();
  const publicHealth = await anon.call("/api/health");
  check("public health hides topology", JSON.stringify(publicHealth.json) === '{"ok":true}', publicHealth.json);
  check("recipes require a session", (await anon.call("/api/recipes")).status === 401);

  const head = await fetch(`${BASE}/api/recipes`);
  check("API responses are private and uncacheable", head.headers.get("cache-control")?.includes("no-store") === true, head.headers.get("cache-control"));
  check("no x-powered-by header", head.headers.get("x-powered-by") === null);
  const page = await fetch(`${BASE}/`);
  const csp = page.headers.get("content-security-policy") ?? "";
  check("pages send CSP limiting the browser to this origin", csp.includes("connect-src 'self'") && csp.includes("frame-ancestors 'none'"), csp);
  check("pages send HSTS and nosniff", Boolean(page.headers.get("strict-transport-security")) && page.headers.get("x-content-type-options") === "nosniff");

  const rpcAnon = await anon.call("/api/rpc", { body: { jsonrpc: "2.0", id: 1, method: "getBlockHeight" } });
  check("RPC proxy requires a session", rpcAnon.status === 401, rpcAnon.json);

  const alice = new Client();
  const a = await signIn(alice);
  check("alice signs in with a real ed25519 signature", a.verify.status === 200 && alice.cookie.startsWith("ml_session="), a.verify.json);
  const replay = await new Client().call("/api/auth/verify", { body: { wallet: a.wallet, nonce: a.payload.nonce, signature: bs58.encode(a.sig) } });
  check("replaying a used nonce is rejected", replay.status === 400, replay.json);

  const forged = new Client();
  const fNonce = await forged.call("/api/auth/nonce", { body: { wallet: a.wallet } });
  const wrongKey = nacl.sign.keyPair();
  const fSig = nacl.sign.detached(new TextEncoder().encode(buildSignInMessage(fNonce.json)), wrongKey.secretKey);
  const fVerify = await forged.call("/api/auth/verify", { body: { wallet: a.wallet, nonce: fNonce.json.nonce, signature: bs58.encode(fSig) } });
  check("a signature from another key can't claim alice's wallet", fVerify.status === 400 && !forged.cookie, fVerify.json);

  const bad = await alice.call("/api/recipes", {
    body: { name: "Bad", config: { tokenMint: USDC_DEVNET, route: { mode: "standard" }, destinations: [{ wallet: a.wallet, amountRaw: "1" }, { wallet: a.wallet, amountRaw: "1" }] } },
  });
  check("duplicate recipient wallets rejected server-side", bad.status === 400 && bad.json?.error?.issues?.some((i: { path: string }) => i.path.includes("destinations.1.wallet")), bad.json);

  const created = await alice.call("/api/recipes", {
    body: { name: "Contributors", description: "", config: { tokenMint: USDC_DEVNET, route: { mode: "standard", hops: 4 }, destinations: destinations() } },
  });
  const recipe = created.json?.recipe;
  check("alice creates a recipe at version 1", created.status === 200 && recipe?.version === 1 && recipe?.totalRaw === "6000000", created.json);

  const edit = (expectedVersion: number, name: string) =>
    alice.call(`/api/recipes/${recipe.id}`, { method: "PUT", body: { name, description: "", config: recipe.config, expectedVersion } });
  const v2 = await edit(1, "Contributors v2");
  check("editing creates version 2", v2.status === 200 && v2.json?.recipe?.version === 2, v2.json);
  const stale = await edit(1, "Lost update");
  check("a stale editor gets 409 instead of overwriting", stale.status === 409 && stale.json?.error?.code === "STALE_WRITE", stale.json);

  const [r1, r2] = await Promise.all([edit(2, "Tab A"), edit(2, "Tab B")]);
  check("two concurrent saves: exactly one wins", [r1.status, r2.status].sort().join() === "200,409", [r1.status, r2.status]);

  const bob = new Client();
  await signIn(bob);
  const peek = await bob.call(`/api/recipes/${recipe.id}`);
  check("bob can't read alice's recipe (404, not 403)", peek.status === 404, peek.json);
  const hijack = await bob.call(`/api/recipes/${recipe.id}/status`, { body: { status: "archived" } });
  check("bob can't archive alice's recipe", hijack.status === 404, hijack.json);
  check("bob's recipe list is empty", (await bob.call("/api/recipes")).json?.recipes?.length === 0);

  const rpcBad = await alice.call("/api/rpc", { body: { jsonrpc: "2.0", id: 1, method: "getProgramAccounts", params: [] } });
  check("RPC proxy refuses methods outside the allowlist", rpcBad.status === 400, rpcBad.json);
  const rpcOk = await alice.call("/api/rpc", { body: { jsonrpc: "2.0", id: 7, method: "getBlockHeight", params: [{ commitment: "confirmed" }] } });
  check("RPC proxy forwards an allowed call without exposing the upstream", rpcOk.status === 200 && rpcOk.json?.id === 7 && !JSON.stringify(rpcOk.json).includes("http"), rpcOk.json);

  const form = await alice.call("/api/recipes", { raw: "name=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
  check("form-encoded writes are refused (CSRF)", form.status === 400, form.json);
  const crossSite = await alice.call("/api/recipes", { body: { name: "x" }, headers: { "sec-fetch-site": "cross-site" } });
  check("cross-site fetches are refused (CSRF)", crossSite.status === 403, crossSite.json);
  const huge = await alice.call("/api/recipes", { raw: JSON.stringify({ name: "x".repeat(40_000) }) });
  check("oversized bodies are refused", huge.status === 400 && /too large/.test(huge.json?.error?.message ?? ""), huge.json?.error);

  const dup = await alice.call(`/api/recipes/${recipe.id}/duplicate`, { body: {} });
  check("duplicate makes an independent recipe", dup.status === 200 && dup.json?.recipe?.id !== recipe.id);

  const run = await alice.call("/api/runs", { body: { recipeId: recipe.id, requestKey: crypto.randomUUID() } });
  check("quoting without a provider key fails safely with 503 NOT_CONFIGURED", run.status === 503 && run.json?.error?.code === "NOT_CONFIGURED", run.json);

  const hook = await anon.call("/api/webhooks/multihopper", { raw: '{"type":"transfer.completed","data":{"id":1}}', headers: { "x-multihopper-signature": "0".repeat(64) } });
  check("unsigned webhook is refused", hook.status === 403 || hook.status === 503, hook.json);

  const cross = await alice.call("/api/recipes", { body: { name: "x", config: {} }, headers: { origin: "https://evil.example" } });
  check("cross-origin write is refused", cross.status === 403, cross.json);

  let limited = false;
  for (let i = 0; i < 14 && !limited; i++) {
    const spoof = { "x-forwarded-for": `10.0.0.${i}, 203.0.113.9` };
    limited = (await anon.call("/api/auth/nonce", { body: { wallet: a.wallet }, headers: spoof })).status === 429;
  }
  check("nonce issuing is rate limited, and a forged X-Forwarded-For prefix doesn't reset it", limited);

  const out = await alice.call("/api/auth/session", { method: "DELETE" });
  const after = await alice.call("/api/recipes");
  check("sign out revokes the session server-side", out.status === 200 && after.status === 401);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
