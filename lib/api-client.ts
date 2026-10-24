import type { ApiErrorBody } from "./dto";

// Browser-side fetch wrapper. Server errors arrive as { error: { code, message, issues } }
// and are rethrown as ApiError so components can show the message as-is.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach Money Lego. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Something went wrong.", e?.issues ?? []);
  }
  return json as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function newRequestKey(): string {
  return crypto.randomUUID();
}
