// Every failure that reaches a route handler is an AppError. The message is written for
// the person using the app; internal detail goes to logs, never into the response body.

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_WRITE"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "AGENT_UNAVAILABLE"
  | "AGENT_BAD_OUTPUT"
  | "INTERNAL";

export interface FieldIssue {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly extra: { issues?: FieldIssue[]; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  validation: (message: string, issues: FieldIssue[] = []) =>
    new AppError("VALIDATION_FAILED", 400, message, { issues }),
  unauthenticated: () => new AppError("UNAUTHENTICATED", 401, "Sign in to continue."),
  forbidden: () => new AppError("FORBIDDEN", 403, "You don't have access to this."),
  notFound: (what: string) => new AppError("NOT_FOUND", 404, `${what} not found.`),
  conflict: (message: string) => new AppError("CONFLICT", 409, message),
  staleWrite: () =>
    new AppError("STALE_WRITE", 409, "This was changed somewhere else. Reload to see the latest version."),
  invalidState: (message: string) => new AppError("INVALID_STATE", 409, message),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError("RATE_LIMITED", 429, "Too many requests. Wait a moment and try again.", { retryAfterSeconds }),
  provider: (message: string, cause?: unknown) => new AppError("PROVIDER_ERROR", 502, message, { cause }),
  providerUnavailable: (provider = "PayPal", cause?: unknown) =>
    new AppError("PROVIDER_UNAVAILABLE", 503, `${provider} is not responding right now. Nothing was changed. Try again in a minute.`, { cause }),
  notConfigured: (what: string) =>
    new AppError("NOT_CONFIGURED", 503, `${what} is not configured on this server yet.`),
  internal: (cause?: unknown) =>
    new AppError("INTERNAL", 500, "Something went wrong on our side. Nothing was sent.", { cause }),
};

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
