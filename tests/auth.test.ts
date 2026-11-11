import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSafeRedirectPath } from "@/lib/auth/redirect";
import { kindeIdentityKey, linkUpdate, planKindeSignIn, type KindeIdentity } from "@/server/auth/link-identity";
import type { UserDoc } from "@/server/db/types";

const member = (m: Partial<UserDoc> & Pick<UserDoc, "kind" | "identityKey">): UserDoc => ({
  _id: new ObjectId(),
  name: "Maya",
  email: "maya@studio.com",
  emailVerified: true,
  createdAt: new Date(),
  lastSignedInAt: new Date(),
  ...m,
});

const identity = (i: Partial<KindeIdentity> = {}): KindeIdentity => ({ id: "kp_123", email: "maya@studio.com", emailVerified: true, name: "Maya", ...i });

describe("post-login redirects", () => {
  it("allows only paths on this site", () => {
    expect(isSafeRedirectPath("/workflows")).toBe(true);
    expect(isSafeRedirectPath("/payments?tab=timeline")).toBe(true);
    expect(isSafeRedirectPath("https://evil.example")).toBe(false);
    expect(isSafeRedirectPath("//evil.example")).toBe(false);
    expect(isSafeRedirectPath("/\\evil.example")).toBe(false);
    expect(isSafeRedirectPath("workflows")).toBe(false);
  });
});

describe("linking a Kinde sign-in to a Money Lego member", () => {
  it("uses the member already linked to this Kinde user", () => {
    const linked = member({ kind: "kinde", identityKey: kindeIdentityKey("kp_123") });
    expect(planKindeSignIn(identity(), linked, [])).toEqual({ action: "use", member: linked });
  });

  it("links an existing Clerk member with the same verified email, keeping its _id", () => {
    const clerk = member({ kind: "clerk", identityKey: "clerk:user_1" });
    expect(planKindeSignIn(identity(), null, [clerk])).toEqual({ action: "link", member: clerk });
  });

  it("prefers the Clerk member over a local one with the same email", () => {
    const local = member({ kind: "local", identityKey: "local:maya@studio.com", emailVerified: false });
    const clerk = member({ kind: "clerk", identityKey: "clerk:user_1" });
    expect(planKindeSignIn(identity(), null, [local, clerk])).toMatchObject({ action: "link", member: clerk });
  });

  it("links a local email + password member when Kinde verified the address", () => {
    const local = member({ kind: "local", identityKey: "local:maya@studio.com", emailVerified: false });
    expect(planKindeSignIn(identity(), null, [local])).toEqual({ action: "link", member: local });
  });

  it("never links when Kinde hasn't verified the email, so nobody can claim another person's account", () => {
    const clerk = member({ kind: "clerk", identityKey: "clerk:user_1" });
    expect(planKindeSignIn(identity({ emailVerified: false }), null, [clerk])).toEqual({ action: "create" });
    expect(planKindeSignIn(identity({ email: null }), null, [clerk])).toEqual({ action: "create" });
  });

  it("doesn't link a Clerk member whose own email was never verified", () => {
    const clerk = member({ kind: "clerk", identityKey: "clerk:user_1", emailVerified: false });
    expect(planKindeSignIn(identity(), null, [clerk])).toEqual({ action: "create" });
  });

  it("never takes over a member that belongs to a different Kinde user", () => {
    const otherKinde = member({ kind: "kinde", identityKey: kindeIdentityKey("kp_other") });
    expect(planKindeSignIn(identity(), null, [otherKinde])).toEqual({ action: "create" });
  });

  it("creates a new member when nothing matches", () => {
    expect(planKindeSignIn(identity(), null, [])).toEqual({ action: "create" });
  });

  it("re-keys a linked member to Kinde, remembers the old key and drops any password", () => {
    const now = new Date();
    expect(linkUpdate(identity(), { identityKey: "clerk:user_1" }, now)).toEqual({
      $set: { identityKey: "kinde:kp_123", kind: "kinde", emailVerified: true, lastSignedInAt: now },
      $addToSet: { previousIdentityKeys: "clerk:user_1" },
      $unset: { passwordHash: "" },
    });
  });
});

// ---------- session resolution and routes, with Kinde, cookies and the database faked ----------

interface Fakes {
  kindeUser?: { id: string; email: string | null; given_name: string | null; family_name: string | null } | null;
  emailVerified?: boolean;
  cookies?: Record<string, string>;
  members?: UserDoc[];
  localSessions?: Array<{ _id: string; userId: ObjectId }>;
}

async function load(fakes: Fakes, kindeEnv: boolean) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ KINDE_CLIENT_ID: "id", KINDE_CLIENT_SECRET: "secret", KINDE_ISSUER_URL: "https://test.kinde.com", KINDE_SITE_URL: "http://localhost:3000" })) {
    vi.stubEnv(name, kindeEnv ? value : "");
  }

  const getKindeServerSession = vi.fn(() => ({
    getUser: async () => fakes.kindeUser ?? null,
    getIdToken: async () => (fakes.kindeUser ? { email_verified: fakes.emailVerified ?? true } : null),
  }));
  const kindeHandler = vi.fn(async () => new Response("handled by kinde"));
  vi.doMock("@kinde-oss/kinde-auth-nextjs/server", () => ({ getKindeServerSession, handleAuth: () => kindeHandler }));

  const jar = fakes.cookies ?? {};
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ get: (name: string) => (jar[name] ? { value: jar[name] } : undefined), set: vi.fn(), delete: vi.fn() }),
  }));

  const members = fakes.members ?? [];
  const users = {
    findOne: vi.fn(async (q: Record<string, unknown>) => members.find((m) => (q._id ? m._id.equals(q._id as ObjectId) : m.identityKey === q.identityKey)) ?? null),
    find: vi.fn((q: { email: string }) => ({ toArray: async () => members.filter((m) => m.email === q.email && m.kind !== "kinde") })),
    updateOne: vi.fn(async () => ({})),
    findOneAndUpdate: vi.fn(async (q: { _id?: ObjectId; identityKey: string }, update: { $set?: Partial<UserDoc>; $setOnInsert?: Partial<UserDoc> }) => {
      const existing = q._id ? members.find((m) => m._id.equals(q._id!)) : members.find((m) => m.identityKey === q.identityKey);
      if (existing) return { ...existing, ...update.$set };
      return { _id: new ObjectId(), ...update.$setOnInsert, ...update.$set } as UserDoc;
    }),
  };
  const sessions = fakes.localSessions ?? [];
  const authSessions = { findOne: vi.fn(async (q: { _id: string }) => sessions.find((s) => s._id === q._id) ?? null), deleteOne: vi.fn() };
  vi.doMock("@/server/db/collections", async (original) => ({ ...(await original<object>()), collections: async () => ({ users, authSessions }) }));

  return { session: await import("@/server/auth/session"), getKindeServerSession, kindeHandler, users };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const m of ["@kinde-oss/kinde-auth-nextjs/server", "next/headers", "@/server/db/collections"]) vi.doUnmock(m);
});

const sha256 = async (text: string) => (await import("node:crypto")).createHash("sha256").update(text).digest("hex");

describe("who is signed in", () => {
  it("nobody, when signed out, and Kinde isn't even asked when it isn't configured", async () => {
    const { session, getKindeServerSession } = await load({}, false);
    await expect(session.currentUser()).resolves.toBeNull();
    await expect(session.requireUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(getKindeServerSession).not.toHaveBeenCalled();
  });

  it("nobody, when Kinde is configured but has no valid session", async () => {
    const { session } = await load({ kindeUser: null }, true);
    await expect(session.currentUser()).resolves.toBeNull();
  });

  it("the linked member for a Kinde user, with their verified email", async () => {
    const linked = member({ kind: "kinde", identityKey: "kinde:kp_123", email: "Maya@Studio.com" });
    const { session } = await load({ kindeUser: { id: "kp_123", email: "maya@studio.com", given_name: "Maya", family_name: null }, members: [linked] }, true);
    await expect(session.currentUser()).resolves.toEqual({ userId: linked._id, name: "Maya", kind: "kinde", email: "maya@studio.com" });
  });

  it("an existing Clerk member on their first Kinde sign-in, so they keep every workflow they own", async () => {
    const clerk = member({ kind: "clerk", identityKey: "clerk:user_1" });
    const { session, users } = await load({ kindeUser: { id: "kp_123", email: "maya@studio.com", given_name: "Maya", family_name: null }, members: [clerk] }, true);
    const user = await session.currentUser();
    expect(user?.userId.equals(clerk._id)).toBe(true);
    expect(user?.kind).toBe("kinde");
    expect(users.findOneAndUpdate).toHaveBeenCalledWith({ _id: clerk._id, identityKey: "clerk:user_1" }, expect.objectContaining({ $set: expect.objectContaining({ identityKey: "kinde:kp_123" }) }), expect.anything());
  });

  it("a new member for a first Kinde sign-in with an unverified email, even if the address matches", async () => {
    const clerk = member({ kind: "clerk", identityKey: "clerk:user_1" });
    const { session } = await load({ kindeUser: { id: "kp_9", email: "maya@studio.com", given_name: null, family_name: null }, emailVerified: false, members: [clerk] }, true);
    const user = await session.currentUser();
    expect(user?.userId.equals(clerk._id)).toBe(false);
    expect(user).toMatchObject({ kind: "kinde", email: null, name: "maya@studio.com" });
  });

  it("an email + password member from their own session cookie, with or without Kinde configured", async () => {
    const local = member({ kind: "local", identityKey: "local:sam@studio.com", email: "sam@studio.com", emailVerified: false, name: "Sam" });
    const token = "local-session-token";
    for (const kindeEnv of [false, true]) {
      const { session } = await load({ kindeUser: null, cookies: { money_lego_session: token }, members: [local], localSessions: [{ _id: await sha256(token), userId: local._id }] }, kindeEnv);
      await expect(session.currentUser()).resolves.toEqual({ userId: local._id, name: "Sam", kind: "local", email: null });
    }
  });
});

describe("routes", () => {
  it("/api/auth/session reports a signed-out visitor without an error", async () => {
    await load({}, false);
    const { GET } = await import("@/app/api/auth/session/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/auth/session"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it("a protected API still answers 401 to a signed-out visitor", async () => {
    await load({}, true);
    const { GET } = await import("@/app/api/workflows/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/workflows"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("serves Kinde's login, register, logout and callback, and nothing else", async () => {
    const { kindeHandler } = await load({}, true);
    const { GET } = await import("@/app/api/auth/[kindeAuth]/route");
    const call = (name: string, query = "") => GET(new NextRequest(`http://localhost:3000/api/auth/${name}${query}`), { params: Promise.resolve({ kindeAuth: name }) });

    for (const name of ["login", "register", "logout", "kinde_callback"]) expect(await (await call(name)).text()).toBe("handled by kinde");
    // "setup" would hand the raw access and ID tokens to the browser.
    for (const name of ["setup", "health", "portal", "create_org", "end_session"]) expect((await call(name)).status).toBe(404);
    expect(kindeHandler).toHaveBeenCalledTimes(4);
  });

  it("refuses a post-login redirect to another site", async () => {
    await load({}, true);
    const { GET } = await import("@/app/api/auth/[kindeAuth]/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/auth/login?post_login_redirect_url=https://evil.example"), { params: Promise.resolve({ kindeAuth: "login" }) });
    expect(res.status).toBe(400);
    const ok = await GET(new NextRequest("http://localhost:3000/api/auth/login?post_login_redirect_url=/workflows"), { params: Promise.resolve({ kindeAuth: "login" }) });
    expect(await ok.text()).toBe("handled by kinde");
  });

  it("serves no Kinde routes at all when Kinde isn't configured", async () => {
    await load({}, false);
    const { GET } = await import("@/app/api/auth/[kindeAuth]/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/auth/login"), { params: Promise.resolve({ kindeAuth: "login" }) });
    expect(res.status).toBe(404);
  });
});
