"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AgReportState, AgStudioApi, AgStudioMode } from "ag-studio";
import { Button } from "@/components/ui/button";
import { statusLabel, triggerLabel } from "@/lib/paypal/labels";
import type { PaymentsOverview } from "@/server/paypal/status";
import { MoneySummary } from "./money-summary";

// AG Studio touches the DOM as it loads, so the canvas renders in the browser only.
const StudioCanvas = dynamic(() => import("./studio-canvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-ink-3">Loading the dashboard…</div>,
});

// The Payments analytics dashboard, built on AG Studio (AG Grid's embedded analytics). Money
// Lego supplies two tables (PayPal objects and workflow runs) with ready-made measure columns,
// plus a prebuilt report; operators can switch to Edit to drag in their own charts, grids and
// KPIs, and the layout they build is remembered in this browser.

// v2: rows are 32px tall and the default report was re-spaced for them; v1 layouts were squashed.
// v3: earlier saved layouts could mix the ledger into the KPI row; everyone starts once on the
// default, where the six KPI tiles share one row.
const STORAGE_KEY = "ml.payments.studio.v3";
const KIND_LABEL: Record<string, string> = {
  order: "Order",
  capture: "Capture",
  refund: "Refund",
  payout_batch: "Payout batch",
  payout_item: "Payout item",
  invoice: "Invoice",
  subscription: "Subscription",
};
const toAmount = (minor: string | null) => (minor && /^-?\d+$/.test(minor) ? Number(minor) / 100 : null);

function paymentRows(data: PaymentsOverview) {
  return data.resources.map((r) => {
    const amount = toAmount(r.amountMinor);
    const capturedOk = r.kind === "capture" && ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(r.status);
    return {
      id: r.id,
      type: KIND_LABEL[r.kind] ?? r.kind,
      paypal_id: r.paypalId,
      status: statusLabel(r.status),
      currency: r.currency ?? "",
      amount,
      // Measure columns, so KPI tiles are a plain sum with no widget filters to configure.
      captured: capturedOk ? amount : null,
      paid_out: r.kind === "payout_item" && r.status === "SUCCESS" ? amount : null,
      refunded: r.kind === "refund" && r.status === "COMPLETED" ? amount : null,
      payout_problem: r.kind === "payout_item" && ["FAILED", "RETURNED", "BLOCKED", "UNCLAIMED", "DENIED"].includes(r.status) ? 1 : 0,
      workflow: r.workflowName ?? "Direct",
      counterparty: r.counterparty ?? "",
      updated: new Date(r.updatedAt),
    };
  });
}

function runRows(data: PaymentsOverview) {
  return data.runs.map((r) => ({
    run_id: r.id,
    run_workflow: r.workflowName,
    run_status: statusLabel(r.status),
    trigger: triggerLabel(r.trigger),
    succeeded: r.status === "succeeded" ? 1 : 0,
    failed: r.status === "failed" ? 1 : 0,
    started: new Date(r.startedAt),
    duration_s: r.finishedAt ? Math.max(0, (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000) : null,
  }));
}

const money = { format: "currencyFormat", formatOptions: { format: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }) } } as const;

function dataDefinition(data: PaymentsOverview) {
  return {
    description:
      "Money Lego payment operations on PayPal (sandbox). 'payments' has one row per PayPal object a workflow created or PayPal reported (orders, captures, refunds, payout batches and items, invoices, subscriptions) with amounts in major currency units. 'runs' has one row per workflow run.",
    sources: [
      {
        id: "payments",
        name: "PayPal objects",
        primaryKeyField: "id",
        data: paymentRows(data),
        fields: [
          { id: "id", format: "textFormat", hide: true },
          { id: "type", name: "Type", format: "textFormat", cardinality: "low" },
          { id: "paypal_id", name: "PayPal ID", format: "textFormat", cardinality: "high" },
          { id: "status", name: "Status", format: "textFormat", cardinality: "low" },
          { id: "currency", name: "Currency", format: "textFormat", cardinality: "low" },
          { id: "amount", name: "Amount", ...money },
          { id: "captured", name: "Captured", ...money },
          { id: "paid_out", name: "Paid out", ...money },
          { id: "refunded", name: "Refunded", ...money },
          { id: "payout_problem", name: "Payout problems", format: "integerFormat" },
          { id: "workflow", name: "Workflow", format: "textFormat", cardinality: "medium" },
          { id: "counterparty", name: "Counterparty", format: "textFormat", cardinality: "high" },
          { id: "updated", name: "Updated", format: "dateTimeFormat" },
        ],
      },
      {
        id: "runs",
        name: "Workflow runs",
        primaryKeyField: "run_id",
        data: runRows(data),
        fields: [
          { id: "run_id", format: "textFormat", hide: true },
          { id: "run_workflow", name: "Workflow", format: "textFormat", cardinality: "medium" },
          { id: "run_status", name: "Run status", format: "textFormat", cardinality: "low" },
          { id: "trigger", name: "Trigger", format: "textFormat", cardinality: "low" },
          { id: "succeeded", name: "Succeeded", format: "integerFormat" },
          { id: "failed", name: "Failed", format: "integerFormat" },
          { id: "started", name: "Started", format: "dateTimeFormat" },
          { id: "duration_s", name: "Duration (s)", format: "decimalFormat" },
        ],
      },
    ],
  };
}

const f = (id: string, aggregation?: "sum" | "count" | "countd" | "avg") => ({ id, ...(aggregation ? { aggregation } : {}) });
// Titles at UI size: Studio's default title size is meant for slide-like pages, not a dense dashboard.
const title = (text: string) => ({ title: { enabled: true, text, typography: { fontSize: 13, fontWeight: "bold" } } });
const kpi = (field: string, label: string, aggregation: "sum" | "count" = "sum") => ({ type: "value", dataMapping: { value: [f(field, aggregation)] }, format: { ...title(label) } });

// The report a new operator sees first. Field references are table-qualified (table.field).
function defaultReport(): AgReportState {
  return {
    selectedPageId: "overview",
    pages: [
      {
        id: "overview",
        widgets: {
          captured: kpi("payments.captured", "Captured"),
          paid_out: kpi("payments.paid_out", "Paid out"),
          refunded: kpi("payments.refunded", "Refunded"),
          problems: kpi("payments.payout_problem", "Payout problems"),
          runs_ok: kpi("runs.succeeded", "Runs succeeded"),
          runs_failed: kpi("runs.failed", "Runs failed"),
          by_type: { type: "column-chart-grouped", dataMapping: { categoryKey: [f("payments.type")], valueKey: [f("payments.amount", "sum")] }, format: { ...title("Volume by PayPal object") } },
          by_status: { type: "donut-chart", dataMapping: { categoryKey: [f("runs.run_status")], valueKey: [f("runs.run_id", "count")] }, format: { ...title("Runs by status") } },
          over_time: { type: "line-chart", dataMapping: { categoryKey: [f("payments.updated")], valueKey: [f("payments.captured", "sum")] }, format: { ...title("Captured over time") } },
          ledger: {
            type: "grid",
            dataMapping: { cols: [f("payments.type"), f("payments.paypal_id"), f("payments.status"), f("payments.amount"), f("payments.currency"), f("payments.workflow"), f("payments.updated")] },
            format: { ...title("PayPal ledger") },
          },
        },
        widgetLayout: {
          // 12 columns x 32px rows: KPI tiles 3 rows, charts 9, ledger 10 (about 700px in all).
          captured: { xTrack: 0, yTrack: 0, xSpan: 2, ySpan: 3 },
          paid_out: { xTrack: 2, yTrack: 0, xSpan: 2, ySpan: 3 },
          refunded: { xTrack: 4, yTrack: 0, xSpan: 2, ySpan: 3 },
          problems: { xTrack: 6, yTrack: 0, xSpan: 2, ySpan: 3 },
          runs_ok: { xTrack: 8, yTrack: 0, xSpan: 2, ySpan: 3 },
          runs_failed: { xTrack: 10, yTrack: 0, xSpan: 2, ySpan: 3 },
          by_type: { xTrack: 0, yTrack: 3, xSpan: 5, ySpan: 9 },
          over_time: { xTrack: 5, yTrack: 3, xSpan: 4, ySpan: 9 },
          by_status: { xTrack: 9, yTrack: 3, xSpan: 3, ySpan: 9 },
          ledger: { xTrack: 0, yTrack: 12, xSpan: 12, ySpan: 10 },
        },
      },
    ],
  } as unknown as AgReportState;
}

export function StudioDashboard({ data }: { data: PaymentsOverview }) {
  const api = useRef<AgStudioApi | null>(null);
  const [mode, setMode] = useState<AgStudioMode>("view");
  const definition = useMemo(() => dataDefinition(data), [data]);
  const editing = mode === "edit";

  // Editing opens full screen: Studio's Filters, Compose and Data panels need the room, and the
  // page behind can't scroll away from the canvas you're working on.
  useEffect(() => {
    if (!editing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [editing]);

  const switchMode = (next: AgStudioMode) => {
    if (next === "view" && api.current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(api.current.getState()));
      } catch {
        // Saving the layout is a convenience; a private window simply won't remember it.
      }
    }
    setMode(next);
  };

  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    api.current?.setState(defaultReport());
  };

  return (
    <section className="flex flex-col gap-2">
      <MoneySummary data={data} />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">Click a chart to filter the rest of the page. Customize it to add your own charts, or ask AI to build them.</p>
        <Button variant="secondary" className="h-8" onClick={() => switchMode("edit")}>
          Customize dashboard
        </Button>
      </div>
      {/* One element for both modes, so Studio isn't recreated when you start or finish editing. */}
      <div
        role={editing ? "dialog" : undefined}
        aria-modal={editing || undefined}
        aria-label={editing ? "Customize the payments dashboard" : undefined}
        className={editing ? "fixed inset-0 z-50 flex flex-col bg-paper" : "flex h-[860px] w-full flex-col overflow-hidden rounded-xl border border-line bg-surface"}
      >
        {editing && (
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">Customize dashboard</p>
              <p className="truncate text-xs text-ink-3">Drag widgets and fields, or ask the AI assistant to build pages. Done saves the layout in this browser.</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="quiet" className="h-9" onClick={reset}>
                Reset
              </Button>
              <Button className="h-9" onClick={() => switchMode("view")}>
                Done
              </Button>
            </div>
          </header>
        )}
        <div className="min-h-0 flex-1">
          <StudioCanvas data={definition} mode={mode} storageKey={STORAGE_KEY} defaultReport={defaultReport} onApi={(a) => (api.current = a)} />
        </div>
      </div>
    </section>
  );
}
