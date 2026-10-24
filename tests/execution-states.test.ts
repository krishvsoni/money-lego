import { describe, expect, it } from "vitest";
import { canTransition, reconcileState } from "@/lib/execution-states";

describe("reconcileState", () => {
  it("maps provider progress forward", () => {
    expect(reconcileState("submitted", "processing")).toBe("processing");
    expect(reconcileState("processing", "active")).toBe("processing");
    expect(reconcileState("processing", "completed")).toBe("completed");
    expect(reconcileState("quoted", "expired")).toBe("expired");
  });
  it("never regresses on stale or out-of-order reports", () => {
    expect(reconcileState("completed", "processing")).toBe("completed");
    expect(reconcileState("processing", "awaiting_signature")).toBe("processing");
    expect(reconcileState("funded", "quote")).toBe("funded");
  });
  it("treats unknown statuses as needing a check, but never over a terminal state", () => {
    expect(reconcileState("processing", "teleported")).toBe("needs_check");
    expect(reconcileState("completed", "teleported")).toBe("completed");
  });
  it("resolves an ambiguous quote once the provider confirms it exists", () => {
    expect(reconcileState("quote_unknown", "quote")).toBe("quoted");
  });
  it("has no exits from completed", () => {
    expect(canTransition("completed", "failed")).toBe(false);
    expect(canTransition("failed", "refunded")).toBe(true);
  });
});
