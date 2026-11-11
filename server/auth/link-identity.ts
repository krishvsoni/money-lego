import type { UserDoc } from "../db/types";

// Which Money Lego member a Kinde sign-in belongs to. Pure, so every case is unit tested.
//
// Workflows, runs and connections belong to a member's _id, never to a sign-in provider, so
// moving a person to Kinde only changes how their member is found:
//   1. The member already linked to this Kinde user.
//   2. On a first Kinde sign-in with an email Kinde has verified: the existing member with
//      that address. A Clerk account (from before the move to Kinde) is preferred over a
//      local email + password one; both keep their _id, so everything they own comes along.
//   3. Otherwise a new member.
// An unverified address never links: anyone can type someone else's email at sign-up.
// A member already linked to a different Kinde user is never taken over.

export interface KindeIdentity {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
}

export type LinkPlan = { action: "use"; member: UserDoc } | { action: "link"; member: UserDoc } | { action: "create" };

export const kindeIdentityKey = (kindeUserId: string) => `kinde:${kindeUserId}`;

// Member kinds an existing account can be linked from, best match first.
const LINKABLE: Array<UserDoc["kind"]> = ["clerk", "local"];

export function planKindeSignIn(identity: KindeIdentity, alreadyLinked: UserDoc | null, sameEmail: UserDoc[]): LinkPlan {
  if (alreadyLinked) return { action: "use", member: alreadyLinked };
  if (!identity.email || !identity.emailVerified) return { action: "create" };
  for (const kind of LINKABLE) {
    const match = sameEmail.find((m) => m.kind === kind && (kind === "local" || m.emailVerified !== false));
    if (match) return { action: "link", member: match };
  }
  return { action: "create" };
}

// Kept on a linked member so support can see where an account came from.
export const linkUpdate = (identity: KindeIdentity, member: Pick<UserDoc, "identityKey">, now: Date) => ({
  $set: { identityKey: kindeIdentityKey(identity.id), kind: "kinde" as const, emailVerified: true, lastSignedInAt: now },
  $addToSet: { previousIdentityKeys: member.identityKey },
  $unset: { passwordHash: "" as const },
});
