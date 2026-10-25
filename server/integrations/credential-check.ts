import "server-only";
import type { SessionUser } from "../auth/session";
import { probeConnection } from "../oauth/store";
import { OAuthError } from "../oauth/types";
import { credentialDTO, readOwnedCredential, recordCheck, type CredentialDTO } from "../workflows/credentials";

// "Verified" means the provider accepted the connection just now. Connections without a
// harmless read (Slack posts only, Stripe and Discord servers deliver events to us) stay as
// their last real interaction proved them, and say so.
export async function testCredential(user: SessionUser, id: string): Promise<{ credential: CredentialDTO; tested: boolean; message: string }> {
  const doc = await readOwnedCredential(user, id);
  let message: string | null;
  try {
    message = doc.account ? await probeConnection(doc) : null;
  } catch (error) {
    const text = error instanceof OAuthError ? error.message : "The provider didn't answer. Try again in a minute.";
    const saved = await recordCheck(user.userId, doc._id, { ok: false, message: text });
    return { credential: saved ?? credentialDTO(doc), tested: true, message: text };
  }
  if (message === null) {
    const untested = doc.account ? "This connection can't be checked without sending something. It's confirmed by its next real use." : "Your own secret. It's confirmed the first time a run uses it.";
    return { credential: credentialDTO(doc), tested: false, message: untested };
  }
  const saved = await recordCheck(user.userId, doc._id, { ok: true, message });
  return { credential: saved ?? credentialDTO(doc), tested: true, message };
}
