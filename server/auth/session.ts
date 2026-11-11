import "server-only";
import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { auth, currentUser as clerkUser } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { collections, isDuplicateKeyError } from "../db/collections";
import type { UserDoc } from "../db/types";
import { env } from "../config/env";
import { errors } from "../errors";

const scrypt = promisify(nodeScrypt);
const LOCAL_SESSION_COOKIE = "money_lego_session";

export interface SessionUser {
  userId: ObjectId;
  name: string;
  kind: "clerk" | "local";
  email: string | null;
}

const sessionOf = (d: UserDoc): SessionUser => ({
  userId: d._id,
  name: d.name,
  kind: d.kind,
  email: d.email && d.emailVerified !== false ? d.email.trim().toLowerCase() : null,
});

function displayName(u: Awaited<ReturnType<typeof clerkUser>>): string {
  if (!u) return "Money Lego user";
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return (full || u.username || u.primaryEmailAddress?.emailAddress || "Money Lego user").slice(0, 80);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = (await scrypt(password, Buffer.from(saltText, "base64url"), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function setLocalSession(userId: ObjectId): Promise<void> {
  const token = randomUUID() + randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env().SESSION_TTL_HOURS * 60 * 60 * 1000);
  const { authSessions } = await collections();
  await authSessions.insertOne({ _id: tokenDigest(token), userId, createdAt: now, expiresAt });
  (await cookies()).set(LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function signOutLocal(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(LOCAL_SESSION_COOKIE)?.value;
  if (token) await (await collections()).authSessions.deleteOne({ _id: tokenDigest(token) });
  jar.delete(LOCAL_SESSION_COOKIE);
}

async function localUser(): Promise<UserDoc | null> {
  const token = (await cookies()).get(LOCAL_SESSION_COOKIE)?.value;
  if (!token) return null;
  const { authSessions, users } = await collections();
  const session = await authSessions.findOne({ _id: tokenDigest(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await users.findOne({ _id: session.userId });
  if (!user || user.kind !== "local") return null;
  await users.updateOne({ _id: user._id }, { $set: { lastSignedInAt: new Date() } });
  return user;
}

async function clerkBackedUser(): Promise<UserDoc | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const { users } = await collections();
  const identityKey = `clerk:${userId}`;
  const existing = await users.findOne({ identityKey });
  if (existing) {
    await users.updateOne({ _id: existing._id }, { $set: { lastSignedInAt: new Date() } });
    return existing;
  }

  const profile = await clerkUser();
  const primary = profile?.primaryEmailAddress ?? null;
  const email = primary?.emailAddress ? normalizeEmail(primary.emailAddress) : null;
  // A local account is linked only after Clerk has verified the same address.
  const local = email && primary?.verification?.status === "verified"
    ? await users.findOne({ email }, { collation: { locale: "en", strength: 2 } })
    : null;
  if (local?.kind === "local") {
    const linked = await users.findOneAndUpdate(
      { _id: local._id, kind: "local" },
      { $set: { identityKey, kind: "clerk", emailVerified: true, lastSignedInAt: new Date() }, $unset: { passwordHash: "" } },
      { returnDocument: "after" },
    );
    if (linked) return linked;
  }

  const now = new Date();
  const doc = await users.findOneAndUpdate(
    { identityKey },
    {
      $setOnInsert: {
        identityKey,
        kind: "clerk",
        name: displayName(profile),
        email: primary?.emailAddress ?? null,
        emailVerified: primary?.verification?.status === "verified",
        createdAt: now,
      },
      $set: { lastSignedInAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw errors.internal();
  return doc;
}

export async function createLocalAccount(input: { name: string; email: string; password: string }): Promise<SessionUser> {
  const email = normalizeEmail(input.email);
  const now = new Date();
  const { users } = await collections();
  const existing = await users.findOne({ email }, { collation: { locale: "en", strength: 2 } });
  if (existing) throw errors.conflict("An account already exists for that email.");
  let doc;
  try {
    doc = await users.insertOne({
      _id: new ObjectId(),
      identityKey: `local:${email}`,
      kind: "local",
      name: input.name.trim().slice(0, 80),
      email,
      emailVerified: false,
      passwordHash: await passwordHash(input.password),
      createdAt: now,
      lastSignedInAt: now,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw errors.conflict("An account already exists for that email.");
    throw error;
  }
  await setLocalSession(doc.insertedId);
  const user = await users.findOne({ _id: doc.insertedId });
  if (!user) throw errors.internal();
  return sessionOf(user);
}

export async function signInLocal(emailInput: string, password: string): Promise<SessionUser> {
  const email = normalizeEmail(emailInput);
  const { users } = await collections();
  const user = await users.findOne({ identityKey: `local:${email}` });
  if (!user?.passwordHash || !(await passwordMatches(password, user.passwordHash))) {
    throw errors.unauthenticated();
  }
  await users.updateOne({ _id: user._id }, { $set: { lastSignedInAt: new Date() } });
  await setLocalSession(user._id);
  return sessionOf(user);
}

export async function currentUser(): Promise<SessionUser | null> {
  const clerk = await clerkBackedUser();
  if (clerk) return sessionOf(clerk);
  const local = await localUser();
  return local ? sessionOf(local) : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}
