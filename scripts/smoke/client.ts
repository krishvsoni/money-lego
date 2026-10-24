import bs58 from "bs58";
import nacl from "tweetnacl";
import { buildSignInMessage, type SignInPayload } from "../../lib/auth-message";

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed API responses in a test script
export type Json = any;

let failures = 0;
export const failureCount = () => failures;

export function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail).slice(0, 400)}`}`);
}

export class Client {
  cookie = "";
  async call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body === undefined && init.raw === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", cookie: this.cookie, ...init.headers },
      body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, json: (await res.json().catch(() => null)) as Json, headers: res.headers };
  }
}

export async function signIn(client: Client) {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const nonce = await client.call("/api/auth/nonce", { body: { wallet } });
  const payload = nonce.json as SignInPayload;
  const sig = nacl.sign.detached(new TextEncoder().encode(buildSignInMessage(payload)), kp.secretKey);
  const verify = await client.call("/api/auth/verify", { body: { wallet, nonce: payload.nonce, signature: bs58.encode(sig) } });
  return { wallet, payload, sig, verify, kp };
}

export const randomWallet = () => bs58.encode(nacl.sign.keyPair().publicKey);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
