import "server-only";
import type { ObjectId } from "mongodb";
import { nodeDefinition } from "@/lib/nodes/registry";
import { env } from "../config/env";
import { collections } from "../db/collections";
import type { WorkflowRunDoc } from "../db/types";
import { log } from "../log";

// Elastic (Elasticsearch / Elastic Cloud) as the search layer for execution history: every
// finished run is indexed with its steps, errors and PayPal ids, so "why did payouts fail
// last week?" is a full-text query, and the AI run explanation can cite similar past
// failures. Optional: without ELASTIC_URL the same search runs on MongoDB and says so.

export function elasticConfigured(): boolean {
  return Boolean(env().ELASTIC_URL && env().ELASTIC_API_KEY);
}

async function es<T>(path: string, init: { method: string; body?: unknown }): Promise<{ status: number; body: T }> {
  const e = env();
  const res = await fetch(`${e.ELASTIC_URL!.replace(/\/$/, "")}${path}`, {
    method: init.method,
    headers: { authorization: `ApiKey ${e.ELASTIC_API_KEY}`, "content-type": "application/json", accept: "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

let indexReady: Promise<void> | null = null;

// Explicit mapping: owner and ids are exact-match keywords, messages are full text.
function ensureIndex(): Promise<void> {
  indexReady ??= es(`/${env().ELASTIC_INDEX}`, {
    method: "PUT",
    body: {
      mappings: {
        properties: {
          ownerId: { type: "keyword" },
          workflowId: { type: "keyword" },
          workflowName: { type: "text", fields: { raw: { type: "keyword" } } },
          status: { type: "keyword" },
          trigger: { type: "keyword" },
          error: { type: "text" },
          text: { type: "text" },
          paypalIds: { type: "keyword" },
          steps: { properties: { node: { type: "keyword" }, type: { type: "keyword" }, title: { type: "text" }, status: { type: "keyword" }, error: { type: "text" } } },
          startedAt: { type: "date" },
          finishedAt: { type: "date" },
        },
      },
    },
  }).then(({ status, body }) => {
    const already = JSON.stringify(body).includes("resource_already_exists_exception");
    if (status >= 300 && !already) {
      indexReady = null;
      throw new Error(`Elastic index setup failed (HTTP ${status}).`);
    }
  });
  return indexReady;
}

const PAYPAL_ID = /\b(?:[A-Z0-9]{17}|INV2(?:-[A-Z0-9]{4}){4}|I-[A-Z0-9]{12}|[A-Z0-9]{13})\b/g;

export async function indexRun(runId: ObjectId): Promise<void> {
  if (!elasticConfigured()) return;
  try {
    const { workflowRuns, nodeRuns } = await collections();
    const run = await workflowRuns.findOne({ _id: runId }, { projection: { graph: 0 } });
    if (!run) return;
    const nodes = await nodeRuns.find({ runId }).toArray();
    const steps = nodes.map((n) => ({ node: n.nodeId, type: n.nodeType, title: nodeDefinition(n.nodeType)?.title ?? n.nodeType, status: n.status, error: n.error }));
    const blob = JSON.stringify(nodes.map((n) => n.output)).slice(0, 20_000);
    const doc = {
      ownerId: run.ownerId.toHexString(),
      workflowId: run.workflowId.toHexString(),
      workflowName: run.workflowName,
      status: run.status,
      trigger: run.trigger.type,
      error: run.error,
      steps,
      paypalIds: [...new Set(blob.match(PAYPAL_ID) ?? [])].slice(0, 50),
      text: [run.error, ...run.log.map((l) => l.message)].filter(Boolean).join("\n").slice(0, 10_000),
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
    await ensureIndex();
    const { status } = await es(`/${env().ELASTIC_INDEX}/_doc/${runId.toHexString()}`, { method: "PUT", body: doc });
    if (status >= 300) log.warn("elastic.index_failed", { status });
  } catch (error) {
    // Search is a convenience; indexing must never affect a run.
    log.warn("elastic.index_error", { error: error instanceof Error ? error.message : "unknown" });
  }
}

export interface RunHit {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  error: string | null;
  startedAt: string;
  highlight: string | null;
}

export async function searchRuns(ownerId: ObjectId, q: string, opts: { status?: string; limit?: number } = {}): Promise<{ engine: "elastic" | "mongodb"; hits: RunHit[] }> {
  const query = q.trim().slice(0, 200);
  const limit = Math.min(50, opts.limit ?? 20);
  if (elasticConfigured()) {
    try {
      await ensureIndex();
      const filter: unknown[] = [{ term: { ownerId: ownerId.toHexString() } }];
      if (opts.status) filter.push({ term: { status: opts.status } });
      const { status, body } = await es<{ hits?: { hits?: Array<{ _id: string; _source: Record<string, unknown>; highlight?: Record<string, string[]> }> } }>(`/${env().ELASTIC_INDEX}/_search`, {
        method: "POST",
        body: {
          size: limit,
          query: { bool: { filter, must: query ? [{ multi_match: { query, fields: ["error^3", "steps.error^3", "workflowName^2", "steps.title", "text", "paypalIds"], fuzziness: "AUTO" } }] : [{ match_all: {} }] } },
          sort: query ? ["_score", { startedAt: "desc" }] : [{ startedAt: "desc" }],
          highlight: { fields: { error: {}, "steps.error": {}, text: {} }, fragment_size: 160, number_of_fragments: 1 },
        },
      });
      if (status < 300) {
        return {
          engine: "elastic",
          hits: (body.hits?.hits ?? []).map((h) => ({
            runId: h._id,
            workflowId: String(h._source.workflowId),
            workflowName: String(h._source.workflowName),
            status: String(h._source.status),
            error: (h._source.error as string | null) ?? null,
            startedAt: String(h._source.startedAt),
            highlight: Object.values(h.highlight ?? {})[0]?.[0]?.replace(/<\/?em>/g, "") ?? null,
          })),
        };
      }
      log.warn("elastic.search_failed", { status });
    } catch (error) {
      log.warn("elastic.search_error", { error: error instanceof Error ? error.message : "unknown" });
    }
  }
  // Fallback: a plain MongoDB search over the same fields, clearly labelled as such.
  const { workflowRuns } = await collections();
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter: Record<string, unknown> = { ownerId };
  if (opts.status) filter.status = opts.status;
  if (safe) filter.$or = [{ error: { $regex: safe, $options: "i" } }, { workflowName: { $regex: safe, $options: "i" } }, { "log.message": { $regex: safe, $options: "i" } }];
  const runs = await workflowRuns.find(filter, { projection: { graph: 0, log: 0 } }).sort({ startedAt: -1 }).limit(limit).toArray();
  return {
    engine: "mongodb",
    hits: runs.map((r: Omit<WorkflowRunDoc, "graph" | "log">) => ({ runId: r._id.toHexString(), workflowId: r.workflowId.toHexString(), workflowName: r.workflowName, status: r.status, error: r.error, startedAt: r.startedAt.toISOString(), highlight: null })),
  };
}
