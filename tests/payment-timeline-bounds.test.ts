import { describe, expect, it } from "vitest";
import { buildTimeline, takeBounded, TIMELINE_LIMITS, truncationOf } from "@/lib/payments/timeline";
import { boundDateRange } from "@/lib/payments/timeline-view";
import { checkAnswer } from "@/server/paypal/timeline";

const PERIOD = { from: "2026-10-12T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z" };

describe("boundDateRange (dates an AI answer may set)", () => {
  it("keeps dates inside the period, normalized to ISO", () => {
    expect(boundDateRange("2026-10-20", "2026-10-25T12:00:00+02:00", PERIOD)).toEqual({ from: "2026-10-20T00:00:00.000Z", to: "2026-10-25T10:00:00.000Z" });
  });

  it("drops dates that don't parse", () => {
    expect(boundDateRange("last tuesday", "2026-10-25", PERIOD)).toEqual({ from: null, to: "2026-10-25T00:00:00.000Z" });
    expect(boundDateRange("", "nope", PERIOD)).toEqual({ from: null, to: null });
  });

  it("rejects a reversed range entirely", () => {
    expect(boundDateRange("2026-10-25", "2026-10-20", PERIOD)).toEqual({ from: null, to: null });
  });

  it("clamps a bound past the period edge to no bound", () => {
    expect(boundDateRange("2020-01-01", "2026-10-20", PERIOD)).toEqual({ from: null, to: "2026-10-20T00:00:00.000Z" });
    expect(boundDateRange("2026-10-20", "2099-01-01", PERIOD)).toEqual({ from: "2026-10-20T00:00:00.000Z", to: null });
    expect(boundDateRange(PERIOD.from, PERIOD.to, PERIOD)).toEqual({ from: null, to: null });
  });

  it("rejects a range entirely outside the period instead of showing an empty view", () => {
    expect(boundDateRange("2025-01-01", "2025-02-01", PERIOD)).toEqual({ from: null, to: null });
    expect(boundDateRange("2027-01-01", null, PERIOD)).toEqual({ from: null, to: null });
    expect(boundDateRange(null, "2026-10-01", PERIOD)).toEqual({ from: null, to: null });
    expect(boundDateRange(PERIOD.to, null, PERIOD)).toEqual({ from: null, to: null });
  });

  it("keeps a filter from a 30-day answer inside a 7-day period chosen afterwards", () => {
    const week = { from: "2026-11-04T00:00:00.000Z", to: "2026-11-11T00:00:00.000Z" };
    expect(boundDateRange("2026-10-15", "2026-11-06", week)).toEqual({ from: null, to: "2026-11-06T00:00:00.000Z" });
  });
});

describe("checkAnswer", () => {
  const timeline = {
    ...PERIOD,
    workflows: [{ id: "wf1", name: "Split" }],
    milestones: [{ id: "m1" }, { id: "m2" }] as never,
  };
  const answer = (from: string | null, to: string | null) => ({
    summary: "Two captures.",
    filter: { states: ["completed" as const], kinds: [], workflowIds: ["wf1", "wf-unknown"], from, to },
    milestoneIds: ["m2", "m-unknown"],
  });

  it("keeps only known ids and in-period dates", () => {
    expect(checkAnswer(answer("2026-10-20", "2026-10-22"), timeline)).toEqual({
      summary: "Two captures.",
      filter: { states: ["completed"], kinds: [], workflowIds: ["wf1"], from: "2026-10-20T00:00:00.000Z", to: "2026-10-22T00:00:00.000Z" },
      milestoneIds: ["m2"],
    });
  });

  it("drops reversed, invalid and out-of-period dates", () => {
    expect(checkAnswer(answer("2026-10-22", "2026-10-20"), timeline).filter).toMatchObject({ from: null, to: null });
    expect(checkAnswer(answer("soon", "2026-10-20"), timeline).filter).toMatchObject({ from: null, to: "2026-10-20T00:00:00.000Z" });
    expect(checkAnswer(answer("1999-01-01", "1999-12-31"), timeline).filter).toMatchObject({ from: null, to: null });
  });
});

describe("timeline truncation", () => {
  it("takeBounded reports rows beyond the limit", () => {
    expect(takeBounded([1, 2, 3], 3)).toEqual({ rows: [1, 2, 3], truncated: false });
    expect(takeBounded([1, 2, 3, 4], 3)).toEqual({ rows: [1, 2, 3], truncated: true });
    expect(takeBounded([], 3)).toEqual({ rows: [], truncated: false });
  });

  it("truncationOf is null when every source is complete", () => {
    expect(truncationOf([{ source: "resources", limit: 10, truncated: false, oldestKept: new Date() }])).toBeNull();
  });

  it("names each truncated source and the latest point all of them are complete from", () => {
    const t = truncationOf([
      { source: "resources", limit: TIMELINE_LIMITS.resources, truncated: true, oldestKept: new Date("2026-10-20T00:00:00Z") },
      { source: "events", limit: TIMELINE_LIMITS.events, truncated: false, oldestKept: new Date("2026-10-01T00:00:00Z") },
      { source: "runs", limit: TIMELINE_LIMITS.runs, truncated: true, oldestKept: new Date("2026-11-01T00:00:00Z") },
    ]);
    expect(t).toEqual({
      sources: [
        { source: "resources", limit: 1000 },
        { source: "runs", limit: 300 },
      ],
      completeSince: "2026-11-01T00:00:00.000Z",
    });
  });

  it("buildTimeline carries the notice through, and defaults to complete", () => {
    const base = { from: new Date(PERIOD.from), to: new Date(PERIOD.to), workflows: [], resources: [], events: [], runs: [] };
    expect(buildTimeline(base).truncation).toBeNull();
    const truncation = { sources: [{ source: "runs" as const, limit: 300 }], completeSince: "2026-11-01T00:00:00.000Z" };
    expect(buildTimeline({ ...base, truncation }).truncation).toEqual(truncation);
  });
});
