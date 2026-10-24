import { ObjectId } from "mongodb";
import { errors } from "../errors";

// A malformed id is reported exactly like a missing record, so ids reveal nothing.
export function parseId(id: string, what = "Record"): ObjectId {
  if (!ObjectId.isValid(id) || id.length !== 24) throw errors.notFound(what);
  return new ObjectId(id);
}
