// Test data. Every trigger has a test payload for the editor's Run button; its data is
// marked `source: "test"` (made-up order, capture and event ids). A run started from it is
// labelled TEST in the run panel and the approvals inbox. Its PayPal steps still run for real
// in the sandbox and count in the Payments totals like any other run.

export function isTestTrigger(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && (payload as Record<string, unknown>).source === "test");
}

export const TEST_MODE_NOTE = "Started from the trigger's test data (made-up capture ids). Its PayPal steps still run in the sandbox.";
