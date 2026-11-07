"use client";

import { useEffect, useRef, useState } from "react";
import type { AgReportState, AgStudioApi, AgStudioMode } from "ag-studio";
import { Button } from "@/components/ui/button";
import { moneyLegoStudioAdapter, STUDIO_PROMPTS } from "./studio-ai";
import type { PaymentsOverview } from "@/server/paypal/status";

// The Payments analytics dashboard, built on AG Studio (AG Grid's embedded analytics). Money
// Lego supplies two tables (PayPal objects and workflow runs) with ready-made measure columns,
// plus a prebuilt report; operators can switch to Edit to drag in their own charts, grids and
// KPIs, and the layout they build is remembered in this browser.

const STORAGE_KEY = "ml.payments.studio.v1";
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
      status: r.status,
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
    run_status: r.status,
    trigger: r.trigger.replace("trigger.", "").replace("_", " "),
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
const title = (text: string) => ({ title: { enabled: true, text } });
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
          captured: { xTrack: 0, yTrack: 0, xSpan: 2, ySpan: 2 },
          paid_out: { xTrack: 2, yTrack: 0, xSpan: 2, ySpan: 2 },
          refunded: { xTrack: 4, yTrack: 0, xSpan: 2, ySpan: 2 },
          problems: { xTrack: 6, yTrack: 0, xSpan: 2, ySpan: 2 },
          runs_ok: { xTrack: 8, yTrack: 0, xSpan: 2, ySpan: 2 },
          runs_failed: { xTrack: 10, yTrack: 0, xSpan: 2, ySpan: 2 },
          by_type: { xTrack: 0, yTrack: 2, xSpan: 5, ySpan: 5 },
          over_time: { xTrack: 5, yTrack: 2, xSpan: 4, ySpan: 5 },
          by_status: { xTrack: 9, yTrack: 2, xSpan: 3, ySpan: 5 },
          ledger: { xTrack: 0, yTrack: 7, xSpan: 12, ySpan: 6 },
        },
      },
    ],
  } as unknown as AgReportState;
}

function savedReport(): AgReportState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgReportState) : null;
  } catch {
    return null;
  }
}

export function StudioDashboard({ data }: { data: PaymentsOverview }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<AgStudioApi | null>(null);
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [error, setError] = useState<string | null>(null);

  // Create once; later data refreshes update the data sources in place.
  useEffect(() => {
    let cancelled = false;
    import("ag-studio")
      .then(({ createStudio, createAiHarness, AgStudioLicenseManager, enableStudioDevValidations }) => {
        if (cancelled || !host.current) return;
        const key = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY;
        if (key) AgStudioLicenseManager.setLicenseKey(key);
        if (process.env.NODE_ENV !== "production") enableStudioDevValidations();
        const base = {
          data: dataDefinition(data) as never,
          mode: "view" as const,
          layout: { columns: 12 },
          loadThemeGoogleFonts: false,
          // AG Studio's own dashboard agents, running on Money Lego's server-side model.
          ai: (params: { api: unknown }) => createAiHarness(params.api as AgStudioApi, { adapter: moneyLegoStudioAdapter, promptStarters: STUDIO_PROMPTS }),
        };
        try {
          api.current = createStudio(host.current, { ...base, initialState: savedReport() ?? defaultReport() });
        } catch (e) {
          // A saved layout from an older version that no longer loads: start from a blank canvas.
          console.warn("AG Studio: saved report rejected, starting blank", e);
          localStorage.removeItem(STORAGE_KEY);
          host.current.innerHTML = "";
          api.current = createStudio(host.current, base);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "AG Studio failed to load."));
    return () => {
      cancelled = true;
      api.current?.destroy();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; data updates below
  }, []);

  useEffect(() => {
    api.current?.updateProperties({ data: dataDefinition(data) as never });
  }, [data]);

  const switchMode = (next: AgStudioMode) => {
    if (next === "view" && api.current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(api.current.getState()));
      } catch {
        // Saving the layout is a convenience; a private window simply won't remember it.
      }
    }
    api.current?.updateProperties({ mode: next });
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">Analytics by AG Studio. {mode === "edit" ? "Drag widgets and fields, or ask the AI assistant to build pages for you. Done saves the layout in this browser." : "Click a chart to cross-filter the rest of the page. Customize to edit it yourself or with AI."}</p>
        <div className="flex gap-2">
          {mode === "edit" && (
            <Button variant="quiet" className="h-8" onClick={reset}>
              Reset
            </Button>
          )}
          <Button variant="secondary" className="h-8" onClick={() => switchMode(mode === "edit" ? "view" : "edit")}>
            {mode === "edit" ? "Done" : "Customize dashboard"}
          </Button>
        </div>
      </div>
      {error && <p className="rounded-md bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>}
      <div ref={host} className="h-[860px] w-full overflow-hidden rounded-xl border border-line bg-surface" />
    </section>
  );
}
