import { describe, expect, it } from "vitest";
import { buildTimeline, stateOf, type EventInput, type ResourceInput, type RunInput } from "@/lib/payments/timeline";
import { applyFilter, NO_FILTER, rowsFor } from "@/lib/payments/timeline-view";

const FROM = new Date("2026-11-01T00:00:00Z");
const TO = new Date("2026-11-10T00:00:00Z");
const at = (day: number, hour = 12) => new Date(Date.UTC(2026, 10, day, hour));

const WF = "aaaaaaaaaaaaaaaaaaaaaaaa";
const workflows = [{ id: WF, name: "Revenue split" }];

const resource = (r: Partial<ResourceInput> & Pick<ResourceInput, "kind" | "paypalId" | "status">): ResourceInput => ({
  amountMinor: null,
  currency: null,
  workflowId: WF,
  runId: null,
  environment: "sandbox",
  orderId: null,
  createdAt: at(2),
  updatedAt: at(2),
  ...r,
});

const event = (e: Partial<EventInput> & Pick<EventInput, "id" | "eventType" | "resourceId">): EventInput => ({
  workflowId: WF,
  status: null,
  amount: null,
  currency: null,
  reason: null,
  receivedAt: at(3),
  ...e,
});

const run = (r: Partial<RunInput> & Pick<RunInput, "id">): RunInput => ({
  workflowId: WF,
  workflowName: "Revenue split",
  status: "succeeded",
  error: null,
  captureId: null,
  startedAt: at(4),
  finishedAt: at(4, 13),
  ...r,
});

const build = (input: { resources?: ResourceInput[]; events?: EventInput[]; runs?: RunInput[] }) =>
  buildTimeline({ from: FROM, to: TO, workflows, resources: input.resources ?? [], events: input.events ?? [], runs: input.runs ?? [] });

describe("status normalization", () => {
  it("maps PayPal and run statuses to timeline states", () => {
    expect(stateOf("capture", "COMPLETED")).toBe("completed");
    expect(stateOf("capture", "PENDING")).toBe("pending");
    expect(stateOf("capture", "DENIED")).toBe("failed");
    expect(stateOf("capture", "PARTIALLY_REFUNDED")).toBe("refunded");
    expect(stateOf("refund", "COMPLETED")).toBe("refunded");
    expect(stateOf("dispute", "OPEN")).toBe("disputed");
    expect(stateOf("payout", "SUCCESS")).toBe("completed");
    expect(stateOf("payout", "UNCLAIMED")).toBe("payout_problem");
    expect(stateOf("payout", "RETURNED")).toBe("payout_problem");
    expect(stateOf("payout", "PROCESSING")).toBe("pending");
    expect(stateOf("run", "succeeded")).toBe("completed");
    expect(stateOf("run", "failed")).toBe("failed");
    expect(stateOf("run", "waiting")).toBe("pending");
  });

  it("treats a status it doesn't know as pending, never as completed", () => {
    expect(stateOf("capture", "SOMETHING_NEW")).toBe("pending");
    expect(stateOf("invoice", "")).toBe("pending");
  });
});

describe("building the timeline", () => {
  it("is empty, not broken, when there is no data", () => {
    const t = build({});
    expect(t.milestones).toEqual([]);
    expect(rowsFor(t.milestones, "workflow")).toEqual([]);
  });

  it("shows a webhook PayPal delivered twice as one milestone", () => {
    const t = build({
      events: [
        event({ id: "WH-1", eventType: "PAYMENT.CAPTURE.COMPLETED", resourceId: "CAP123456789", receivedAt: at(3) }),
        event({ id: "WH-2", eventType: "PAYMENT.CAPTURE.COMPLETED", resourceId: "CAP123456789", receivedAt: at(3, 14) }),
      ],
    });
    expect(t.milestones).toHaveLength(1);
    expect(t.milestones[0].at).toBe(at(3).toISOString());
  });

  it("merges our own record and PayPal's webhook for the same status, keeping the earliest time and the amount", () => {
    const t = build({
      resources: [resource({ kind: "capture", paypalId: "CAP123456789", status: "COMPLETED", amountMinor: "10000", currency: "USD", updatedAt: at(3, 15) })],
      events: [event({ id: "WH-1", eventType: "PAYMENT.CAPTURE.COMPLETED", resourceId: "CAP123456789", receivedAt: at(3, 12) })],
    });
    expect(t.milestones).toHaveLength(1);
    expect(t.milestones[0]).toMatchObject({ state: "completed", at: at(3, 12).toISOString(), amountMinor: "10000", currency: "USD" });
  });

  it("keeps each status a payment went through as its own milestone", () => {
    const t = build({
      resources: [resource({ kind: "capture", paypalId: "CAP123456789", status: "COMPLETED", updatedAt: at(5) })],
      events: [event({ id: "WH-1", eventType: "PAYMENT.CAPTURE.PENDING", resourceId: "CAP123456789", receivedAt: at(3) })],
    });
    expect(t.milestones.map((m) => m.state)).toEqual(["pending", "completed"]);
  });

  it("follows a capture through the run it started to the payout that run made", () => {
    const t = build({
      resources: [
        resource({ kind: "order", paypalId: "ORDER0000001", status: "COMPLETED", updatedAt: at(4, 9) }),
        resource({ kind: "capture", paypalId: "CAP123456789", status: "COMPLETED", orderId: "ORDER0000001", updatedAt: at(4, 10) }),
        resource({ kind: "payout_batch", paypalId: "BATCH0000001", status: "SUCCESS", runId: "r1", updatedAt: at(4, 13) }),
      ],
      runs: [run({ id: "r1", captureId: "CAP123456789", startedAt: at(4, 11) })],
    });
    expect(t.milestones).toHaveLength(4);
    expect(new Set(t.milestones.map((m) => m.lifecycleId)).size).toBe(1);
    expect(t.milestones.find((m) => m.kind === "capture")?.runId).toBe("r1");
    expect(rowsFor(t.milestones, "payment")).toHaveLength(1);
  });

  it("works for an incomplete lifecycle: a capture with no run or payout yet", () => {
    const t = build({ resources: [resource({ kind: "capture", paypalId: "CAP123456789", status: "COMPLETED", workflowId: null })] });
    expect(t.milestones).toHaveLength(1);
    expect(t.milestones[0]).toMatchObject({ runId: null, workflowId: null, workflowName: null });
    expect(rowsFor(t.milestones, "workflow")).toEqual([{ id: "unlinked", name: "Not linked to a workflow" }]);
  });

  it("draws a run still in progress up to the end of the period", () => {
    const t = build({ runs: [run({ id: "r1", status: "waiting", finishedAt: null })] });
    expect(t.milestones[0]).toMatchObject({ kind: "run", state: "pending", endAt: TO.toISOString() });
  });

  it("leaves out anything outside the period", () => {
    const t = build({ resources: [resource({ kind: "capture", paypalId: "CAP123456789", status: "COMPLETED", updatedAt: new Date("2026-10-01T00:00:00Z") })] });
    expect(t.milestones).toEqual([]);
  });

  it("never sends a full PayPal id to the browser", () => {
    const t = build({
      resources: [resource({ kind: "capture", paypalId: "CAPTUREFULLID99", status: "COMPLETED", orderId: "ORDERFULLID77" })],
      events: [event({ id: "WH-1", eventType: "CUSTOMER.DISPUTE.CREATED", resourceId: "DISPUTEFULLID55" })],
    });
    const json = JSON.stringify(t);
    for (const id of ["CAPTUREFULLID99", "ORDERFULLID77", "DISPUTEFULLID55"]) expect(json).not.toContain(id);
    expect(t.milestones.find((m) => m.kind === "capture")?.paypalId).toBe("…LLID99");
  });

  it("gives the same ids on every refresh", () => {
    const input = { resources: [resource({ kind: "capture", paypalId: "CAP123456789", status: "COMPLETED" })] };
    expect(build(input).milestones.map((m) => m.id)).toEqual(build(input).milestones.map((m) => m.id));
  });
});

describe("filtering", () => {
  const t = build({
    resources: [
      resource({ kind: "capture", paypalId: "CAP000000001", status: "DENIED", updatedAt: at(2) }),
      resource({ kind: "capture", paypalId: "CAP000000002", status: "COMPLETED", updatedAt: at(6) }),
      resource({ kind: "payout_item", paypalId: "ITEM00000001", status: "UNCLAIMED", updatedAt: at(7), workflowId: null }),
    ],
  });

  it("shows everything with no filter", () => {
    expect(applyFilter(t.milestones, NO_FILTER)).toHaveLength(3);
  });

  it("narrows by state, kind, workflow and date", () => {
    expect(applyFilter(t.milestones, { ...NO_FILTER, states: ["failed"] }).map((m) => m.status)).toEqual(["DENIED"]);
    expect(applyFilter(t.milestones, { ...NO_FILTER, states: ["payout_problem"] }).map((m) => m.kind)).toEqual(["payout"]);
    expect(applyFilter(t.milestones, { ...NO_FILTER, kinds: ["capture"] })).toHaveLength(2);
    expect(applyFilter(t.milestones, { ...NO_FILTER, workflowIds: [WF] })).toHaveLength(2);
    expect(applyFilter(t.milestones, { ...NO_FILTER, from: at(5).toISOString(), to: at(6, 23).toISOString() }).map((m) => m.status)).toEqual(["COMPLETED"]);
  });
});
