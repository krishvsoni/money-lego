import "server-only";
import { createHash, randomBytes, randomUUID, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { collections, EMAIL_COLLATION, isDuplicateKeyError } from "../db/collections";
import type { UserDoc } from "../db/types";
import { env } from "../config/env";
import { errors } from "../errors";
import { kindeIdentity } from "./kinde";
import { kindeIdentityKey, linkUpdate, planKindeSignIn } from "./link-identity";

// Who is making a request. Kinde is the sign-in provider; a first-party email + password
// account is the fallback. Both resolve to the same SessionUser, keyed on our own member _id,
// so ownership checks never depend on which one was used.

const scrypt = promisify(nodeScrypt);
const LOCAL_SESSION_COOKIE = "money_lego_session";
const SESSION_TTL_MS = 72 * 60 * 60 * 1000;

export interface SessionUser {
  userId: ObjectId;
  name: string;
  kind: "kinde" | "local";
  // The verified sign-in address, lower-cased; null when the provider hasn't verified it.
  email: string | null;
}

const sessionOf = (d: UserDoc): SessionUser => ({
  userId: d._id,
  name: d.name,
  kind: d.kind === "local" ? "local" : "kinde",
  email: d.email && d.emailVerified !== false ? d.email.trim().toLowerCase() : null,
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Accounts from before the move to Kinde (Clerk) have no password: they sign in with Kinde,
// which links them on first use with the same verified email. The messages stay plain and
// don't name an auth provider.
const USES_KINDE = "An account already exists for that email. Sign in instead.";
const WRONG_PASSWORD = "Email or password is incorrect.";

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
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
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

async function kindeBackedUser(): Promise<UserDoc | null> {
  const identity = await kindeIdentity();
  if (!identity) return null;
  const { users } = await collections();
  const identityKey = kindeIdentityKey(identity.id);
  const now = new Date();

  const alreadyLinked = await users.findOne({ identityKey });
  const sameEmail =
    !alreadyLinked && identity.email && identity.emailVerified
      ? await users.find({ email: identity.email, kind: { $in: ["clerk", "local"] } }, { collation: EMAIL_COLLATION }).toArray()
      : [];
  const plan = planKindeSignIn(identity, alreadyLinked, sameEmail);

  if (plan.action === "use") {
    await users.updateOne({ _id: plan.member._id }, { $set: { lastSignedInAt: now } });
    return plan.member;
  }

  if (plan.action === "link") {
    // Only if the member is still what we read, so two first requests can't both link it.
    const linked = await users.findOneAndUpdate({ _id: plan.member._id, identityKey: plan.member.identityKey }, linkUpdate(identity, plan.member, now), { returnDocument: "after" });
    if (linked) return linked;
    const linkedMeanwhile = await users.findOne({ identityKey });
    if (linkedMeanwhile) return linkedMeanwhile;
  }

  // An upsert on the unique identityKey, so two first requests still make one member.
  const created = await users.findOneAndUpdate(
    { identityKey },
    {
      $setOnInsert: { identityKey, kind: "kinde", name: identity.name, email: identity.email, emailVerified: identity.emailVerified, createdAt: now },
      $set: { lastSignedInAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!created) throw errors.internal();
  return created;
}

export async function createLocalAccount(input: { name: string; email: string; password: string }): Promise<SessionUser> {
  const email = normalizeEmail(input.email);
  const now = new Date();
  const { users } = await collections();
  const existing = await users.findOne({ email }, { collation: EMAIL_COLLATION });
  if (existing) throw errors.conflict(existing.kind === "local" ? "An account already exists for that email. Sign in instead." : USES_KINDE);
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
    throw errors.unauthenticated(WRONG_PASSWORD);
  }
  await users.updateOne({ _id: user._id }, { $set: { lastSignedInAt: new Date() } });
  await setLocalSession(user._id);
  return sessionOf(user);
}

export async function currentUser(): Promise<SessionUser | null> {
  const kinde = await kindeBackedUser();
  if (kinde) return sessionOf(kinde);
  const local = await localUser();
  return local ? sessionOf(local) : null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}
