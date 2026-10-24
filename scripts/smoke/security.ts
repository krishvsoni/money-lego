import bs58 from "bs58";
import nacl from "tweetnacl";
import { buildSignInMessage } from "../../lib/auth-message";
import { BASE, check, Client, signIn } from "./client";

// Auth, ownership, CSRF, headers, rate limits and the RPC proxy.
export async function securityChecks(): Promise<{ alice: Client; aliceWallet: string }> {
  const anon = new Client();
  const publicHealth = await anon.call("/api/health");
  check("public health hides topology", JSON.stringify(publicHealth.json) === '{"ok":true}', publicHealth.json);
  check("workflows require a session", (await anon.call("/api/workflows")).status === 401);

  const head = await fetch(`${BASE}/api/workflows`);
  check("API responses are private and uncacheable", head.headers.get("cache-control")?.includes("no-store") === true);
  check("no x-powered-by header", head.headers.get("x-powered-by") === null);
  const csp = (await fetch(`${BASE}/`)).headers.get("content-security-policy") ?? "";
  check("CSP limits the browser to this origin", csp.includes("connect-src 'self'") && csp.includes("frame-ancestors 'none'"), csp);
  check("RPC proxy requires a session", (await anon.call("/api/rpc", { body: { jsonrpc: "2.0", id: 1, method: "getBlockHeight" } })).status === 401);

  const alice = new Client();
  const a = await signIn(alice);
  check("sign in with a real ed25519 signature", a.verify.status === 200 && alice.cookie.startsWith("ml_session="), a.verify.json);
  const replay = await new Client().call("/api/auth/verify", { body: { wallet: a.wallet, nonce: a.payload.nonce, signature: bs58.encode(a.sig) } });
  check("a used nonce can't be replayed", replay.status === 400);
  const forged = new Client();
  const fNonce = await forged.call("/api/auth/nonce", { body: { wallet: a.wallet } });
  const fSig = nacl.sign.detached(new TextEncoder().encode(buildSignInMessage(fNonce.json)), nacl.sign.keyPair().secretKey);
  const fVerify = await forged.call("/api/auth/verify", { body: { wallet: a.wallet, nonce: fNonce.json.nonce, signature: bs58.encode(fSig) } });
  check("another key can't claim the wallet", fVerify.status === 400 && !forged.cookie);

  const created = await alice.call("/api/workflows", { body: { templateId: "blank", name: "Smoke" } });
  const wf = created.json?.workflow;
  check("create a workflow at version 1", created.status === 200 && wf?.version === 1, created.json);
  const save = (expectedVersion: number, name: string) => alice.call(`/api/workflows/${wf.id}`, { method: "PUT", body: { name, graph: wf.graph, expectedVersion } });
  check("saving creates version 2", (await save(1, "Smoke v2")).json?.workflow?.version === 2);
  const stale = await save(1, "Lost update");
  check("a stale editor gets 409 instead of overwriting", stale.status === 409 && stale.json?.error?.code === "STALE_WRITE");
  const [r1, r2] = await Promise.all([save(2, "Tab A"), save(2, "Tab B")]);
  check("two concurrent saves: exactly one wins", [r1.status, r2.status].sort().join() === "200,409", [r1.status, r2.status]);
  const cyclic = await alice.call(`/api/workflows/${wf.id}`, {
    method: "PUT",
    body: { name: "x", expectedVersion: 3, graph: { schemaVersion: 1, nodes: [{ id: "a", type: "nope.bad;", position: { x: 0, y: 0 }, config: {} }], edges: [] } },
  });
  check("malformed graphs are rejected by schema", cyclic.status === 400);
  const enable = await alice.call(`/api/workflows/${wf.id}/enabled`, { body: { enabled: true } });
  check("an invalid workflow can't be turned on", enable.status === 400 && /trigger/i.test(enable.json?.error?.message ?? ""), enable.json);

  const bob = new Client();
  await signIn(bob);
  check("bob can't read alice's workflow (404)", (await bob.call(`/api/workflows/${wf.id}`)).status === 404);
  check("bob can't archive it", (await bob.call(`/api/workflows/${wf.id}/status`, { body: { status: "archived" } })).status === 404);
  check("bob can't run it", (await bob.call(`/api/workflows/${wf.id}/runs`, { body: { requestKey: crypto.randomUUID() } })).status === 404);

  check("RPC proxy refuses methods outside the allowlist", (await alice.call("/api/rpc", { body: { jsonrpc: "2.0", id: 1, method: "getProgramAccounts", params: [] } })).status === 400);
  const form = await alice.call("/api/workflows", { raw: "templateId=blank", headers: { "content-type": "application/x-www-form-urlencoded" } });
  check("form-encoded writes are refused (CSRF)", form.status === 400);
  check("cross-site fetches are refused (CSRF)", (await alice.call("/api/workflows", { body: { templateId: "blank" }, headers: { "sec-fetch-site": "cross-site" } })).status === 403);
  check("cross-origin writes are refused", (await alice.call("/api/workflows", { body: { templateId: "blank" }, headers: { origin: "https://evil.example" } })).status === 403);
  const huge = await alice.call("/api/workflows", { raw: JSON.stringify({ templateId: "x".repeat(40_000) }) });
  check("oversized bodies are refused", huge.status === 400 && /too large/.test(huge.json?.error?.message ?? ""));

  const secret = await alice.call("/api/credentials", { body: { type: "webhook_secret", name: "Smoke" } });
  const listed = await alice.call("/api/credentials");
  check("a generated secret is revealed once and never listed", typeof secret.json?.revealOnce === "string" && !JSON.stringify(listed.json).includes(secret.json.revealOnce));
  check("bob can't see alice's credentials", (await bob.call("/api/credentials")).json?.credentials?.length === 0);
  const badDiscord = await alice.call("/api/credentials", { body: { type: "discord_webhook", name: "x", url: "https://evil.example/api/webhooks/1" } });
  check("only real Discord webhook URLs are accepted", badDiscord.status === 400);

  let limited = false;
  for (let i = 0; i < 14 && !limited; i++) {
    limited = (await anon.call("/api/auth/nonce", { body: { wallet: a.wallet }, headers: { "x-forwarded-for": `10.0.0.${i}, 203.0.113.9` } })).status === 429;
  }
  check("nonce issuing is rate limited, and a forged X-Forwarded-For prefix doesn't reset it", limited);
  return { alice, aliceWallet: a.wallet };
}
