// Expressions let a node read data produced earlier in the run, written as
// {{ input.amount }}, {{ trigger.body.event }} or {{ nodes.split.amountRaw }}.
// They are path lookups only: no code is evaluated, and prototype keys are refused.

export interface Scope {
  input: unknown;
  trigger: unknown;
  nodes: Record<string, unknown>;
  run: { id: string; workflowId: string };
}

const EXPRESSION = /\{\{\s*([^}]+?)\s*\}\}/g;
const WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

const PATH = /^[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*|\[\d+\])*$/;

export function parsePath(path: string): string[] | null {
  if (!PATH.test(path)) return null;
  const parts = path.split(/\.|\[|\]/).filter(Boolean);
  return parts.some((p) => FORBIDDEN.has(p)) ? null : parts;
}

export function getPath(source: unknown, path: string): unknown {
  const parts = parsePath(path.trim());
  if (!parts) return undefined;
  let value: unknown = source;
  for (const part of parts) {
    if (value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function lookup(scope: Scope, path: string): unknown {
  const [root, ...rest] = path.split(/(?=[.[])/);
  const base = { input: scope.input, trigger: scope.trigger, nodes: scope.nodes, run: scope.run }[root as keyof Scope];
  if (base === undefined) return undefined;
  const tail = rest.join("").replace(/^\./, "");
  return tail ? getPath(base, tail) : base;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// A string that is exactly one expression keeps the referenced value's type, so
// "{{ input.recipients }}" yields an array. Mixed text is interpolated as a string.
export function resolveValue(value: unknown, scope: Scope): unknown {
  if (typeof value === "string") {
    const whole = value.match(WHOLE);
    if (whole) return lookup(scope, whole[1]);
    return value.includes("{{") ? value.replace(EXPRESSION, (_, path: string) => stringify(lookup(scope, path))) : value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, scope));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, scope)]));
  }
  return value;
}

export function hasExpression(value: unknown): boolean {
  return typeof value === "string" && value.includes("{{");
}
