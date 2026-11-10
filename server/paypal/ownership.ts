import "server-only";
import type { ObjectId } from "mongodb";
import { collections } from "../db/collections";
import { env } from "../config/env";

// Every Money Lego account shares the server's one PayPal merchant app, so PayPal itself
// can't tell accounts apart. Money Lego's ledger (paypal_resources) can: each object a
// workflow created or touched is stamped with the account that owns it. These rules keep
// each account to its own PayPal objects:
//  - an object stamped with another account is never read, refunded, sent or re-stamped;
//  - whole-account listings (invoices, transactions, the assistant's PayPal agent) are
//    filtered down to the caller's own objects, except for the account(s) that own the
//    PayPal app itself (PAYPAL_ACCOUNT_OWNER_IDS), who see everything in it.

export type PaypalKind = "order" | "capture" | "refund" | "payout_batch" | "payout_item" | "invoice" | "subscription";

export function ownsPaypalAccount(ownerId: ObjectId): boolean {
  const ids = (env().PAYPAL_ACCOUNT_OWNER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(ownerId.toHexString());
}

// True when the ledger says this PayPal object belongs to a different account.
export async function ownedByAnother(paypalId: string, ownerId: ObjectId, kinds?: PaypalKind[]): Promise<boolean> {
  if (!paypalId) return false;
  const { paypalResources } = await collections();
  const other = await paypalResources.findOne(
    { paypalId, ...(kinds ? { kind: { $in: kinds } } : {}), ownerId: { $nin: [null, ownerId] } },
    { projection: { _id: 1 } },
  );
  return Boolean(other);
}

// The PayPal ids of this account's own objects of the given kinds.
export async function ownPaypalIds(ownerId: ObjectId, kinds: PaypalKind[]): Promise<Set<string>> {
  const { paypalResources } = await collections();
  const rows = await paypalResources.find({ ownerId, kind: { $in: kinds } }, { projection: { paypalId: 1 } }).toArray();
  return new Set(rows.map((r) => r.paypalId));
}

export const FOREIGN_OBJECT = "That PayPal object belongs to another Money Lego account, so this workflow can't use it.";
