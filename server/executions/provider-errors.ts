import "server-only";
import { AppError, errors } from "../errors";
import { ProviderAmbiguous, ProviderRejected } from "../multihopper/http";

// Translates MultiHopper error codes into messages that tell the user what happened and
// what to do next. Codes come from docs/MULTIHOPPER_INTEGRATION.md.

const MESSAGES: Record<string, string> = {
  MH_001: "The MultiHopper API key was rejected. The app operator needs to update it.",
  MH_002: "The MultiHopper API key was revoked. The app operator needs a new one.",
  MH_003: "This MultiHopper integration is suspended. Contact the app operator.",
  MH_010: "MultiHopper doesn't support this token on this network.",
  MH_011: "MultiHopper rejected one of the wallet addresses. Check each recipient.",
  MH_012: "The amount is below MultiHopper's minimum. Increase the total.",
  MH_013: "Hop count must be between 3 and 10.",
  MH_014: "Delivery time is too short for that many hops. Allow more time or use fewer hops.",
  MH_016: "The amount is too small to cover fees. Increase the total.",
  MH_017: "At least one recipient's share is too small after fees. Raise the smallest amounts.",
  MH_034: "This quote expired. Get a new quote to continue.",
  MH_035: "MultiHopper says this transfer can't take that step in its current state. Recheck its status.",
  MH_036: "The transaction isn't visible on chain yet. Wait a few seconds and continue.",
  MH_037: "A transaction failed on chain. Nothing further was sent. Retry to prepare fresh transactions.",
  MH_038: "A signed transaction didn't match the prepared route. Retry from the wallet step.",
  MH_039: "The funding transaction must be confirmed first.",
  MH_040: "Fees changed since this quote. Get a new quote to continue.",
  MH_041: "Recipients aren't bound on chain yet. Continue signing to finish setup.",
  MH_050: "MultiHopper couldn't reach the webhook URL. It must be public HTTPS.",
  MH_051: "This integration already has the maximum number of webhook endpoints.",
  MH_080: "Recovery isn't possible while the transfer is in this phase. Recheck its status.",
  MH_081: "There is nothing left to rescue from this transfer.",
  MH_082: "There is no rent left to refund for this transfer.",
  MH_083: "The signed rescue transactions didn't match what MultiHopper prepared. Start the recovery again.",
  MH_091: "MultiHopper is temporarily unavailable. Nothing was sent. Try again shortly.",
};

export function providerToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ProviderAmbiguous) return errors.providerUnavailable(error);
  if (error instanceof ProviderRejected) {
    if (error.code === "MH_004") return errors.rateLimited(error.retryAfterSeconds ?? 10);
    const message = MESSAGES[error.code] ?? `MultiHopper declined the request (${error.code}). Nothing was sent.`;
    return new AppError("PROVIDER_ERROR", error.status === 409 ? 409 : 422, message, { cause: error });
  }
  return errors.internal(error);
}

export function providerCode(error: unknown): string | null {
  return error instanceof ProviderRejected ? error.code : null;
}
