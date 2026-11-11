import { z, type ZodType } from "zod";

// OpenAI Structured Outputs for a zod schema. A strict schema makes the model's reply valid
// on the first try, so no second "fix your JSON" call is needed. OpenAI's strict mode needs
// every object closed and every key required, and supports only a core of JSON Schema, so
// length/range limits are dropped here (zod still enforces them on the reply). A schema with
// a free-form object (a record of anything) can't be strict; it's still sent as guidance.

export interface ResponseFormat {
  type: "json_schema";
  json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
}

const DROP = new Set(["$schema", "default", "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "propertyNames"]);

type Node = Record<string, unknown>;

// Returns the strict form, or null when a part can't be expressed strictly.
function strictify(node: unknown): unknown {
  if (Array.isArray(node)) {
    const out = node.map(strictify);
    return out.includes(null) ? null : out;
  }
  if (!node || typeof node !== "object") return node;
  const n = node as Node;
  const out: Node = {};
  for (const [k, v] of Object.entries(n)) {
    if (DROP.has(k)) continue;
    if (k === "properties" || k === "$defs" || k === "definitions") {
      const props: Node = {};
      for (const [pk, pv] of Object.entries(v as Node)) {
        const s = strictify(pv);
        if (s === null) return null;
        props[pk] = s;
      }
      out[k] = props;
      continue;
    }
    if (k === "additionalProperties" && v && typeof v === "object") return null;
    const s = strictify(v);
    if (s === null) return null;
    out[k] = s;
  }
  const isObject = n.type === "object" || (Array.isArray(n.type) && n.type.includes("object"));
  if (isObject) {
    if (!n.properties || !Object.keys(n.properties as Node).length) return null;
    out.additionalProperties = false;
    out.required = Object.keys(n.properties as Node);
  }
  return out;
}

const loose = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(loose);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(Object.entries(node as Node).filter(([k]) => k !== "$schema").map(([k, v]) => [k, loose(v)]));
};

const cache = new WeakMap<ZodType, ResponseFormat | null>();

export function responseFormatFor(name: string, schema: ZodType): ResponseFormat | null {
  if (cache.has(schema)) return cache.get(schema)!;
  let format: ResponseFormat | null = null;
  try {
    const json = z.toJSONSchema(schema, { io: "output", unrepresentable: "any" }) as Node;
    if (json.type === "object") {
      const strict = strictify(json) as Node | null;
      format = { type: "json_schema", json_schema: { name: name.replace(/[^\w-]/g, "_").slice(0, 64), strict: Boolean(strict), schema: (strict ?? loose(json)) as Node } };
    }
  } catch {
    format = null;
  }
  cache.set(schema, format);
  return format;
}
