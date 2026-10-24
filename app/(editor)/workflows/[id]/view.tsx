"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { WorkflowDTO } from "@/lib/workflow/dto";
import { useResource } from "@/lib/use-resource";
import { WorkflowEditor } from "@/features/workflows/editor/workflow-editor";

export function View() {
  const { id } = useParams<{ id: string }>();
  const runId = useSearchParams().get("run");
  const { data, error } = useResource<{ workflow: WorkflowDTO }>(`/api/workflows/${id}`);
  if (error) {
    return (
      <div className="p-10">
        <p role="alert" className="text-danger">{error}</p>
        <Link href="/workflows" className="mt-3 inline-block text-sm font-semibold text-action underline">
          Back to workflows
        </Link>
      </div>
    );
  }
  if (!data) return <div className="h-dvh animate-pulse bg-sunken" aria-label="Loading workflow" />;
  return <WorkflowEditor initial={data.workflow} initialRunId={runId && /^[0-9a-f]{24}$/.test(runId) ? runId : null} />;
}
