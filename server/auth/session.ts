import "server-only";
import { auth, currentUser as clerkUser } from "@clerk/nextjs/server";
import type { ObjectId } from "mongodb";
import { collections } from "../db/collections";
import type { UserDoc } from "../db/types";
import { errors } from "../errors";

// Identity comes from Clerk. Each Clerk user maps to one Money Lego member document
// (identityKey "clerk:<userId>") that owns workflows, runs and credentials, so ownership
// checks everywhere stay on our own ObjectId and never on a provider id.

export interface SessionUser {
  userId: ObjectId;
  name: string;
  kind: "clerk";
  // The verified sign-in address, lower-cased: what workflows are shared to. Null when
  // Clerk had not verified it, so an unproven address can never claim someone's share.
  email: string | null;
}

const sessionOf = (d: UserDoc): SessionUser => ({
  userId: d._id,
  name: d.name,
  kind: "clerk",
  email: d.email && d.emailVerified !== false ? d.email.trim().toLowerCase() : null,
});

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
  if (existing) return sessionOf(existing);

  // First request from this Clerk user: create their member record once.
  const profile = await clerkUser();
  const now = new Date();
  const primary = profile?.primaryEmailAddress ?? null;
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
  return sessionOf(doc);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}
