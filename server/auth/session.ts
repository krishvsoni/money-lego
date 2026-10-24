import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { env } from "../config/env";
import { collections } from "../db/collections";
import { errors } from "../errors";

// Opaque session tokens. The browser holds the token in an httpOnly cookie; the database
// holds only its SHA-256, so reading the sessions collection never yields a usable login.
// Sessions live in Mongo rather than process memory, so any instance can serve any request.

export const SESSION_COOKIE = "ml_session";

export interface SessionUser {
  userId: ObjectId;
  wallet: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: ObjectId, wallet: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ttlMs = env().SESSION_TTL_HOURS * 3_600_000;
  const now = new Date();
  const { sessions } = await collections();
  await sessions.insertOne({
    _id: hashToken(token),
    userId,
    wallet,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  });
  const jar = await cookies();
  jar.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { sessions } = await collections();
  // TTL deletion runs about once a minute, so expiry is also checked on read.
  const session = await sessions.findOne({ _id: hashToken(token), expiresAt: { $gt: new Date() } });
  return session ? { userId: session.userId, wallet: session.wallet } : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const { sessions } = await collections();
    await sessions.deleteOne({ _id: hashToken(token) });
  }
  jar.delete(SESSION_COOKIE);
}
