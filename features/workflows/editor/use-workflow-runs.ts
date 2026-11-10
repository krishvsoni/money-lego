"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage, newRequestKey } from "@/lib/api-client";
import type { RunDTO } from "@/lib/workflow/dto";
import type { NodeRunStatus } from "@/lib/workflow/types";
import { refreshApprovals } from "@/features/approvals/approvals-store";

const ACTIVE = new Set(["queued", "running", "waiting"]);

export function useWorkflowRuns(workflowId: string, initialRunId: string | null, toast: (m: string, k?: "info" | "error" | "success") => void) {
  const [runs, setRuns] = useState<RunDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialRunId);
  const [detail, setDetail] = useState<RunDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // An approval decision shows the moment it's clicked; it is cleared again only if the
  // server refuses it, so the buttons come back with the error.
  const [decided, setDecided] = useState<{ runId: string; nodeId: string; decision: "approved" | "rejected" } | null>(null);
  const requestKey = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    const res = await api<{ runs: RunDTO[] }>(`/api/workflows/${workflowId}/runs`).catch(() => null);
    if (res) setRuns(res.runs);
  }, [workflowId]);

  const loadDetail = useCallback(
    async (id: string, advance: boolean) => {
      const res = await api<{ run: RunDTO }>(`/api/workflow-runs/${id}${advance ? "?advance=1" : ""}`).catch(() => null);
      if (res) {
        setDetail(res.run);
        setRuns((list) => list.map((r) => (r.id === id ? { ...r, status: res.run.status, waiting: res.run.waiting, error: res.run.error } : r)));
      }
      return res?.run ?? null;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    api<{ runs: RunDTO[] }>(`/api/workflows/${workflowId}/runs`)
      .then((res) => !cancelled && setRuns(res.runs))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    api<{ run: RunDTO }>(`/api/workflow-runs/${selectedId}`)
      .then((res) => !cancelled && setDetail(res.run))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Poll the open run while it's in flight. Asking with advance=1 also nudges the engine,
  // which keeps local development moving without a scheduler running.
  useEffect(() => {
    if (!detail || !ACTIVE.has(detail.status) || detail.id !== selectedId) return;
    const t = setInterval(() => {
      if (!document.hidden) void loadDetail(detail.id, true);
    }, 3_000);
    return () => clearInterval(t);
  }, [detail, selectedId, loadDetail]);

  const act = useCallback(
    async (name: string, run: () => Promise<{ run: RunDTO }>, success?: string) => {
      setBusy(name);
      try {
        const res = await run();
        setDetail(res.run);
        setSelectedId(res.run.id);
        await loadList();
        if (success) toast(success, "success");
        return res.run;
      } catch (e) {
        if (!(e instanceof ApiError && e.code === "CONFLICT")) toast(errorMessage(e), "error");
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [loadList, toast],
  );

  const startTest = useCallback(async () => {
    requestKey.current ??= newRequestKey();
    const key = requestKey.current;
    const run = await act("test", () => api(`/api/workflows/${workflowId}/runs`, { body: { requestKey: key } })).catch(() => null);
    requestKey.current = null;
    return run;
  }, [act, workflowId]);

  const decide = (nodeId: string, decision: "approved" | "rejected") => {
    if (!detail) return null;
    const runId = detail.id;
    setDecided({ runId, nodeId, decision });
    return act("approve", () => api(`/api/workflow-runs/${runId}/approve`, { body: { nodeId, decision } }), decision === "approved" ? "Approved" : "Rejected")
      .then((run) => {
        refreshApprovals(); // the nav bell's count drops straight away
        return run;
      })
      .catch(() => {
      setDecided((d) => (d?.runId === runId && d.nodeId === nodeId ? null : d));
      return null;
    });
  };

  const cancel = () => detail && act("cancel", () => api(`/api/workflow-runs/${detail.id}/cancel`, { body: {} }), "Run cancelled").catch(() => null);

  const retry = async () => {
    if (!detail) return;
    try {
      await act("retry", () => api(`/api/workflow-runs/${detail.id}/retry`, { body: { confirmSideEffects: false } }));
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT" && window.confirm(`${e.message}`)) {
        await act("retry", () => api(`/api/workflow-runs/${detail.id}/retry`, { body: { confirmSideEffects: true } })).catch(() => null);
      }
    }
  };

  const statuses: Record<string, NodeRunStatus> = Object.fromEntries((detail?.nodes ?? []).map((n) => [n.nodeId, n.status]));

  return { runs, selectedId, setSelectedId, detail, busy, decided, statuses, startTest, decide, cancel, retry, refresh: () => detail && loadDetail(detail.id, true) };
}

export type Runs = ReturnType<typeof useWorkflowRuns>;
