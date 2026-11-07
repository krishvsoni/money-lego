import "server-only";
import { z } from "zod";
import { nodeDefinition } from "@/lib/nodes/registry";
import type { SessionUser } from "../auth/session";
import { getRunDetail } from "../engine/runs";
import { searchRuns } from "../integrations/elastic";
import { askJson, ownerTag, redact } from "./model";

// "Explain this run": a plain-language summary of what happened, grounded only in the
// persisted run record (statuses, errors, node outputs, PayPal ids). Read-only.

const schema = z.object({
  headline: z.string().min(1).max(160),
  summary: z.string().min(1).max(900),
  nextSteps: z.array(z.string().max(240)).max(4).default([]),
});

export async function explainRun(user: SessionUser, runId: string) {
  const run = await getRunDetail(user, runId, false);
  const steps = (run.nodes ?? []).map((n) => ({ node: n.nodeId, type: n.nodeType, title: nodeDefinition(n.nodeType)?.title ?? n.nodeType, status: n.status, branch: n.port, error: n.error, output: redact(n.output) }));
  // Similar past failures (Elastic full-text search when configured) ground the explanation.
  const similar = run.error ? (await searchRuns(user.userId, run.error, { status: "failed", limit: 5 }).catch(() => null))?.hits.filter((h) => h.runId !== run.id).slice(0, 3) ?? [] : [];
  return askJson({
    tag: ownerTag(user.userId),
    schema,
    system:
      "You explain a finished or paused payment-automation run to a small-business owner. Use only the run record. Say what started it, what each important step did (especially PayPal actions and their ids/statuses), whether money moved, and why it stopped if it failed or is waiting. Be concrete and brief. Suggest next steps only when useful. If similar past failures are given, say whether this looks like a recurring problem.",
    user: JSON.stringify({ status: run.status, error: run.error, waiting: run.waiting, trigger: run.trigger, log: run.log.slice(-25), steps, similarPastFailures: similar.map((s) => ({ workflow: s.workflowName, error: s.error, at: s.startedAt })) }),
  });
}
