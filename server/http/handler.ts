import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { requireUser, type SessionUser } from "../auth/session";
import { env } from "../config/env";
import { AppError, errors, isAppError, type FieldIssue } from "../errors";
import { log } from "../log";
import { enforceRateLimit, type RateRule } from "./rate-limit";

// Every API route goes through `route()`. It owns the cross-cutting concerns so handlers
// only contain business logic: request ids, origin checks, auth, rate limits, body
// validation, and turning any thrown error into a safe, consistent JSON response.

interface Options<B extends ZodType | undefined, A extends boolean> {
  auth: A;
  body?: B;
  rate?: RateRule;
}

interface Context<B, A extends boolean> {
  req: NextRequest;
  body: B;
  user: A extends true ? SessionUser : null;
  requestId: string;
}

type Handler<B, A extends boolean, P> = (ctx: Context<B, A>, params: P) => Promise<unknown>;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  if (!allowed.has(origin)) throw errors.forbidden();
}

export function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

function toResponse(error: unknown, requestId: string): NextResponse {
  let appError: AppError;
  if (isAppError(error)) appError = error;
  else if (error instanceof ZodError) appError = errors.validation("Some fields need attention.", zodIssues(error));
  else if ((error as { code?: number })?.code === 121) appError = errors.validation("That change breaks a data rule.");
  else appError = errors.internal(error);

  const level = appError.status >= 500 ? "error" : "warn";
  log[level]("http.error", { requestId, code: appError.code, status: appError.status, cause: appError.extra.cause ?? error });

  const headers: Record<string, string> = { "x-request-id": requestId };
  if (appError.extra.retryAfterSeconds) headers["retry-after"] = String(appError.extra.retryAfterSeconds);
  return NextResponse.json(
    { error: { code: appError.code, message: appError.message, issues: appError.extra.issues, requestId } },
    { status: appError.status, headers },
  );
}

export function route<B extends ZodType | undefined, A extends boolean, P = unknown>(
  options: Options<B, A>,
  handler: Handler<B extends ZodType ? z.infer<B> : undefined, A, P>,
) {
  return async (req: NextRequest, routeContext: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const started = Date.now();
    try {
      assertSameOrigin(req);
      const user = options.auth ? await requireUser() : null;
      if (options.rate) await enforceRateLimit(options.rate, user ? user.userId.toHexString() : clientIp(req));

      let body: unknown = undefined;
      if (options.body) {
        const raw = await req.json().catch(() => {
          throw errors.validation("Request body must be valid JSON.");
        });
        body = options.body.parse(raw);
      }

      const params = (await routeContext?.params) ?? ({} as P);
      const result = await handler(
        { req, body, user, requestId } as Context<B extends ZodType ? z.infer<B> : undefined, A>,
        params,
      );
      log.debug("http.ok", { requestId, path: req.nextUrl.pathname, ms: Date.now() - started });
      return result instanceof NextResponse
        ? result
        : NextResponse.json(result ?? { ok: true }, { headers: { "x-request-id": requestId } });
    } catch (error) {
      return toResponse(error, requestId);
    }
  };
}
