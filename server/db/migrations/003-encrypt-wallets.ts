import type { AnyBulkWriteOperation, Db, Document } from "mongodb";
import { maskWallet, sealWallet, walletIndex } from "../../crypto/wallet-vault";
import { COLLECTIONS } from "../names";
import { validators as baseValidators } from "./001-schema";

// Moves every stored wallet address to encrypted form and makes the database refuse
// plaintext from now on. Safe to re-run: each step only touches documents that still
// carry a plaintext field.
//
// Order matters. The new validators go on at "moderate" first, which lets the legacy
// (now invalid) documents be rewritten; once the data is converted they switch to
// "strict", so no code path or manual write can put a plaintext wallet back.

const BATCH = 500;
const hash = { bsonType: "string", pattern: "^[a-f0-9]{64}$" };
const sealed = { bsonType: "string", minLength: 40, maxLength: 256 };

function withoutPlain(schema: Document, field: string): Document {
  return { ...schema, not: { required: [field] } };
}

const executionsBase = baseValidators[COLLECTIONS.executions].$jsonSchema as Document;
const executionProps = Object.fromEntries(Object.entries(executionsBase.properties as Document).filter(([k]) => k !== "sourceWallet"));

const validators: Record<string, Document> = {
  [COLLECTIONS.users]: {
    $jsonSchema: withoutPlain(
      {
        bsonType: "object",
        required: ["walletHash", "walletEnc", "createdAt", "lastSignedInAt"],
        properties: { walletHash: hash, walletEnc: sealed, createdAt: { bsonType: "date" }, lastSignedInAt: { bsonType: "date" } },
      },
      "wallet",
    ),
  },
  [COLLECTIONS.sessions]: {
    $jsonSchema: withoutPlain(
      { bsonType: "object", required: ["userId", "walletEnc", "expiresAt"], properties: { userId: { bsonType: "objectId" }, walletEnc: sealed } },
      "wallet",
    ),
  },
  [COLLECTIONS.nonces]: {
    $jsonSchema: withoutPlain({ bsonType: "object", required: ["walletHash", "expiresAt"], properties: { walletHash: hash } }, "wallet"),
  },
  [COLLECTIONS.executions]: {
    $jsonSchema: withoutPlain(
      { ...executionsBase, required: [...(executionsBase.required as string[]), "sourceWalletEnc"], properties: { ...executionProps, sourceWalletEnc: sealed } },
      "sourceWallet",
    ),
  },
};

async function setValidation(db: Db, level: "moderate" | "strict") {
  for (const [name, validator] of Object.entries(validators)) {
    await db.command({ collMod: name, validator, validationLevel: level, validationAction: "error" });
  }
}

async function rewrite(db: Db, name: string, filter: Document, toOp: (doc: Document) => AnyBulkWriteOperation) {
  const coll = db.collection(name);
  let ops: AnyBulkWriteOperation[] = [];
  for await (const doc of coll.find(filter)) {
    ops.push(toOp(doc));
    if (ops.length >= BATCH) {
      await coll.bulkWrite(ops, { ordered: false });
      ops = [];
    }
  }
  if (ops.length) await coll.bulkWrite(ops, { ordered: false });
}

const plain = (field: string) => ({ [field]: { $type: "string" } });

export const migration003 = {
  id: "003-encrypt-wallets",
  async up(db: Db) {
    await setValidation(db, "moderate");

    await rewrite(db, COLLECTIONS.users, plain("wallet"), (d) => ({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { walletHash: walletIndex(d.wallet), walletEnc: sealWallet(d.wallet, "users.wallet") }, $unset: { wallet: "" } },
      },
    }));
    await rewrite(db, COLLECTIONS.sessions, plain("wallet"), (d) => ({
      updateOne: { filter: { _id: d._id }, update: { $set: { walletEnc: sealWallet(d.wallet, "sessions.wallet") }, $unset: { wallet: "" } } },
    }));
    await rewrite(db, COLLECTIONS.executions, plain("sourceWallet"), (d) => ({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { sourceWalletEnc: sealWallet(d.sourceWallet, "executions.sourceWallet") }, $unset: { sourceWallet: "" } },
      },
    }));
    // Nonces live five minutes; dropping the legacy ones only means a sign-in in flight retries.
    await db.collection(COLLECTIONS.nonces).deleteMany(plain("wallet"));

    // Approval records only need to say who decided, so the full address is cut to a mask.
    await rewrite(db, COLLECTIONS.nodeRuns, { nodeType: "logic.approval", "waitState.by": { $type: "string", $not: /…/ } }, (d) => {
      const set: Document = { "waitState.by": maskWallet(d.waitState.by) };
      if (typeof d.output?.approval?.by === "string") set["output.approval.by"] = maskWallet(d.output.approval.by);
      return { updateOne: { filter: { _id: d._id }, update: { $set: set } } };
    });

    const users = db.collection(COLLECTIONS.users);
    if (await users.indexExists("wallet_unique")) await users.dropIndex("wallet_unique");
    await users.createIndex({ walletHash: 1 }, { unique: true, name: "wallet_hash_unique" });

    await setValidation(db, "strict");
  },
};
