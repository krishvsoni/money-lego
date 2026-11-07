import "server-only";
import { auth, currentUser as clerkUser } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { collections } from "../db/collections";
import { errors } from "../errors";

// Identity comes from Clerk. Each Clerk user maps to one Money Lego member document
// (identityKey "clerk:<userId>") that owns workflows, runs and credentials, so ownership
// checks everywhere stay on our own ObjectId and never on a provider id.

export interface SessionUser {
  userId: ObjectId;
  name: string;
  kind: "clerk";
}

function displayName(u: Awaited<ReturnType<typeof clerkUser>>): string {
  if (!u) return "Money Lego user";
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return (full || u.username || u.primaryEmailAddress?.emailAddress || "Money Lego user").slice(0, 80);
}

export async function currentUser(): Promise<SessionUser | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const { users } = await collections();
  const identityKey = `clerk:${userId}`;
  const existing = await users.findOne({ identityKey });
  if (existing) return { userId: existing._id, name: existing.name, kind: "clerk" };

  // First request from this Clerk user: create their member record once.
  const profile = await clerkUser();
  const now = new Date();
  const doc = await users.findOneAndUpdate(
    { identityKey },
    {
      $setOnInsert: { identityKey, kind: "clerk", name: displayName(profile), email: profile?.primaryEmailAddress?.emailAddress ?? null, createdAt: now },
      $set: { lastSignedInAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw errors.internal();
  return { userId: doc._id, name: doc.name, kind: "clerk" };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}
