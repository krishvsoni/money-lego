// Re-wraps every stored secret under the active credential key. Put the new key first in
// CREDENTIALS_KEYRING (keep the old one after it), deploy, run this, then remove the old
// key. Each row is rewritten with a compare-and-set on its old ciphertext, so it's safe to
// run while the app serves traffic and safe to re-run after an interruption.
// Usage: MONGODB_URI=… CREDENTIALS_KEYRING="k2:…,k1:…" bun --conditions=react-server scripts/rotate-credential-keys.ts

import { collections } from "@/server/db/collections";
import { mongoClient } from "@/server/db/client";
import { needsRewrap } from "@/server/crypto/envelope";
import { openFor, sealFor } from "@/server/oauth/store";

async function main() {
  const { credentials } = await collections();
  let rewrapped = 0;
  let current = 0;
  for await (const doc of credentials.find({}, { projection: { _id: 1, ownerId: 1, type: 1, secret: 1 } })) {
    if (!needsRewrap(doc.secret)) {
      current++;
      continue;
    }
    const plain = openFor(doc as never);
    const res = await credentials.updateOne({ _id: doc._id, secret: doc.secret }, { $set: { secret: sealFor(doc, plain) } });
    rewrapped += res.modifiedCount;
  }
  console.log(`rewrapped ${rewrapped}, already current ${current}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Rotation failed.");
    process.exitCode = 1;
  })
  .finally(() => mongoClient().close());
