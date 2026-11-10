"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api-client";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams, type ValueFormatterParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { statusLabel, triggerLabel } from "@/lib/paypal/labels";
import { formatMoney } from "@/lib/paypal/types";
import { useResource } from "@/lib/use-resource";
import type { PaymentsOverview } from "@/server/paypal/status";
import { StudioDashboard } from "@/features/payments/studio-dashboard";

ModuleRegistry.registerModules([AllCommunityModule]);

// AG Grid themed to the app: same font, quiet borders, PayPal blue as the accent.
const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 13,
  headerFontWeight: 600,
  accentColor: "#0070e0",
  borderColor: "#e4e4e7",
  headerBackgroundColor: "#fafafa",
  rowHoverColor: "#f4f6fb",
  wrapperBorderRadius: 12,
});

type Resource = PaymentsOverview["resources"][number];
type Run = PaymentsOverview["runs"][number];

const KIND_LABEL: Record<string, string> = {
  order: "Order",
  capture: "Capture",
  refund: "Refund",
  payout_batch: "Payout batch",
  payout_item: "Payout item",
  invoice: "Invoice",
  subscription: "Subscription",
};

const GOOD = ["COMPLETED", "SUCCESS", "PAID", "MARKED_AS_PAID", "ACTIVE", "succeeded", "APPROVED", "SENT", "REMINDED"];
const BAD = ["DENIED", "FAILED", "DECLINED", "RETURNED", "BLOCKED", "REVERSED", "CANCELED", "CANCELLED", "failed", "UNCLAIMED", "SUSPENDED"];


function StatusChip({ value }: { value: string }) {
  const tone = GOOD.includes(value) ? "bg-success-wash text-success" : BAD.includes(value) ? "bg-danger-wash text-danger" : "bg-attention-wash text-attention";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{statusLabel(value)}</span>;
}

function totals(map: Record<string, string>): string {
  const entries = Object.entries(map);
  return entries.length ? entries.map(([c, m]) => formatMoney(m, c)).join(" · ") : "0.00";
}

interface SearchResult {
  engine: "elastic" | "mongodb";
  hits: Array<{ runId: string; workflowId: string; workflowName: string; status: string; error: string | null; startedAt: string; highlight: string | null }>;
}

// Full-text search across run history: errors, step failures, workflow names, PayPal ids.
function RunSearch() {
  const [q, setQ] = useState("");
  const [onlyFailed, setOnlyFailed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api<SearchResult>(`/api/search?q=${encodeURIComponent(q)}${onlyFailed ? "&status=failed" : ""}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <form onSubmit={go} className="flex flex-wrap items-center gap-2">
        <input aria-label="Search runs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Why did payouts fail? e.g. insufficient funds, unclaimed, a capture id" className="h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-3 text-sm" />
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} className="accent-[var(--action)]" /> Failed only
        </label>
        <Button type="submit" variant="secondary" className="h-9" busy={busy}>
          Search runs
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {result && (
        <div className="mt-3">
          <p className="text-[11px] text-ink-3">{result.hits.length === 0 ? "No matching runs." : `${result.hits.length} matching run${result.hits.length === 1 ? "" : "s"}`}</p>
          <ul className="mt-1 divide-y divide-line text-sm">
            {result.hits.map((h) => (
              <li key={h.runId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <Link href={`/workflows/${h.workflowId}?run=${h.runId}`} className="font-semibold text-action hover:underline">
                  {h.workflowName}
                </Link>
                <StatusChip value={h.status} />
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{h.highlight ?? h.error ?? ""}</span>
                <span className="text-xs text-ink-3">{relativeTime(h.startedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold text-ink-3">{label}</p>
      <p className="num mt-1 truncate text-xl font-bold text-ink" title={value}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

export function View() {
  const { data, error, loading, reload } = useResource<PaymentsOverview>("/api/payments");
  const [tab, setTab] = useState<"dashboard" | "objects" | "runs">("dashboard");
  const [kind, setKind] = useState<string>("all");
  const [search, setSearch] = useState("");

  const resourceCols = useMemo<ColDef<Resource>[]>(
    () => [
      { field: "kind", headerName: "Type", width: 130, valueFormatter: (p: ValueFormatterParams<Resource>) => KIND_LABEL[String(p.value)] ?? String(p.value) },
      { field: "paypalId", headerName: "PayPal ID", flex: 1.2, minWidth: 170, cellClass: "font-mono" },
      { field: "status", width: 150, cellRenderer: (p: ICellRendererParams<Resource>) => <StatusChip value={String(p.value ?? "")} /> },
      {
        headerName: "Amount",
        width: 140,
        type: "rightAligned",
        valueGetter: (p) => (p.data?.amountMinor ? Number(p.data.amountMinor) : null),
        valueFormatter: (p: ValueFormatterParams<Resource>) => (p.data?.amountMinor ? formatMoney(p.data.amountMinor, p.data.currency) : "—"),
      },
      { field: "counterparty", headerName: "Counterparty", flex: 1, minWidth: 140, valueFormatter: (p: ValueFormatterParams<Resource>) => String(p.value ?? "—") },
      {
        field: "workflowName",
        headerName: "Workflow",
        flex: 1,
        minWidth: 160,
        cellRenderer: (p: ICellRendererParams<Resource>) =>
          p.data?.workflowId ? (
            <Link className="text-action underline-offset-2 hover:underline" href={`/workflows/${p.data.workflowId}${p.data.runId ? `?run=${p.data.runId}` : ""}`}>
              {p.data.workflowName}
            </Link>
          ) : (
            "—"
          ),
      },
      { field: "updatedAt", headerName: "Updated", width: 140, sort: "desc", valueFormatter: (p: ValueFormatterParams<Resource>) => relativeTime(String(p.value)) },
    ],
    [],
  );

  const runCols = useMemo<ColDef<Run>[]>(
    () => [
      { field: "workflowName", headerName: "Workflow", flex: 1, minWidth: 180 },
      { field: "status", width: 130, cellRenderer: (p: ICellRendererParams<Run>) => <StatusChip value={String(p.value ?? "")} /> },
      { field: "trigger", headerName: "Started by", width: 180, valueFormatter: (p: ValueFormatterParams<Run>) => triggerLabel(String(p.value ?? "")) },
      { field: "error", headerName: "What went wrong", flex: 1.5, minWidth: 200, tooltip: (p) => (p.data?.error ? String(p.data.error) : undefined), valueFormatter: (p: ValueFormatterParams<Run>) => String(p.value ?? "") },
      { field: "startedAt", headerName: "Started", width: 140, sort: "desc", valueFormatter: (p: ValueFormatterParams<Run>) => relativeTime(String(p.value)) },
      {
        headerName: "",
        width: 90,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<Run>) =>
          p.data ? (
            <Link className="font-semibold text-action" href={`/workflows/${p.data.workflowId}?run=${p.data.id}`}>
              Open
            </Link>
          ) : null,
      },
    ],
    [],
  );

  const rows = useMemo(() => (data?.resources ?? []).filter((r) => kind === "all" || r.kind === kind), [data, kind]);
  const k = data?.kpis;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Every PayPal object your workflows created or PayPal reported back: captures, payouts, refunds and invoices, with the run behind each one. PayPal Sandbox data only."
        actions={
          <Button variant="secondary" onClick={reload} busy={loading && !!data}>
            Refresh
          </Button>
        }
      />
      {error && <p className="rounded-md bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Captured" value={k ? totals(k.captured) : "…"} hint={k ? `${k.captures.completed} completed · ${k.captures.pending} pending · ${k.captures.denied} denied` : undefined} />
        <Tile label="Paid out" value={k ? totals(k.paidOut) : "…"} hint={k ? `${k.payouts.batches} batches · ${k.payouts.processing} processing` : undefined} />
        <Tile label="Refunded" value={k ? totals(k.refunded) : "…"} />
        <Tile label="Invoices" value={k ? String(k.invoices.total) : "…"} hint={k ? `${k.invoices.paid} paid · ${k.invoices.reminded} reminded` : undefined} />
        <Tile label="Run success" value={k ? (k.runs.successRate === null ? "—" : `${k.runs.successRate}%`) : "…"} hint={k ? `${k.runs.succeeded} ok · ${k.runs.failed} failed · ${k.runs.waiting} waiting` : undefined} />
      </div>
      {k && k.payouts.problems > 0 && (
        <p className="rounded-md bg-attention-wash px-3 py-2 text-sm text-attention">
          {k.payouts.problems} payout item{k.payouts.problems > 1 ? "s" : ""} failed, were returned or are unclaimed. Filter by Payout item to see which.
        </p>
      )}

      <RunSearch />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-line bg-paper p-0.5 text-sm font-semibold" role="tablist">
          {(["dashboard", "objects", "runs"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 ${tab === t ? "bg-ink text-paper" : "text-ink-2"}`}>
              {t === "dashboard" ? "Dashboard" : t === "objects" ? "PayPal objects" : "Workflow runs"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "objects" && (
            <select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
              <option value="all">All types</option>
              {Object.entries(KIND_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          {tab !== "dashboard" && <input aria-label="Search" placeholder="Search ids, statuses…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56 rounded-md border border-line bg-surface px-3 text-sm" />}
        </div>
      </div>

      {tab === "dashboard" && data && <StudioDashboard data={data} />}
      <div className={tab === "dashboard" ? "hidden" : "h-[520px] w-full"}>
        {tab === "objects" ? (
          <AgGridReact<Resource>
            theme={theme}
            rowData={rows}
            columnDefs={resourceCols}
            quickFilterText={search}
            getRowId={(p) => p.data.id}
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[20, 50, 100]}
            overlayNoRowsTemplate="No PayPal activity yet. Pay a workflow's checkout page or run a template."
            loading={loading && !data}
          />
        ) : (
          <AgGridReact<Run>
            theme={theme}
            rowData={data?.runs ?? []}
            columnDefs={runCols}
            quickFilterText={search}
            getRowId={(p) => p.data.id}
            pagination
            paginationPageSize={20}
            paginationPageSizeSelector={[20, 50, 100]}
            tooltipShowDelay={300}
            overlayNoRowsTemplate="No runs yet."
            loading={loading && !data}
          />
        )}
      </div>
      <p className="text-xs text-ink-3">Amounts are exact, straight from PayPal. Statuses update on their own as PayPal reports changes.</p>
    </div>
  );
}
