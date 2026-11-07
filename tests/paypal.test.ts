import { describe, expect, it } from "vitest";
import { formatMoney, keyFromReference, referenceFor, toMinor, toPaypalValue } from "@/lib/paypal/types";
import type { Scope } from "@/lib/workflow/expressions";
import { WORKFLOW_SCHEMA_VERSION, type WorkflowGraph } from "@/lib/workflow/types";
import { allocate } from "@/server/engine/executors/paypal";
import { intentFor, intentHash, planActions, plannedHash, requireApproved } from "@/server/engine/intents";
import { parseEvent } from "@/server/paypal/webhooks";

const recipients = [
  { label: "Creator", email: "creator@example.com", share: "70" },
  { label: "Agency", email: "agency@example.com", share: "20" },
  { label: "Reserve", email: "", share: "10" },
];

describe("money formatting", () => {
  it("converts decimals to cents and back without floats", () => {
    expect(toMinor("96.02")).toBe(9602n);
    expect(toMinor("100")).toBe(10000n);
    expect(toPaypalValue(9602n)).toBe("96.02");
    expect(toPaypalValue("10000")).toBe("100.00");
    expect(toPaypalValue(5n)).toBe("0.05");
    expect(formatMoney("123456789", "USD")).toBe("1,234,567.89 USD");
  });
  it("rejects more than two decimals", () => {
    expect(() => toMinor("1.005")).toThrow();
  });
});

describe("data.allocate", () => {
  it("splits by percent to the cent and keeps reserves out of the payout", () => {
    const a = allocate({ total: "96.02", currency: "usd", mode: "percent", recipients });
    expect(a.currency).toBe("USD");
    expect(a.items.map((i) => i.amountMinor)).toEqual(["6722", "1920", "960"]);
    expect(a.items.reduce((s, i) => s + BigInt(i.amountMinor), 0n)).toBe(9602n);
    expect(a.items[2].keep).toBe(true);
    expect(a.payoutMinor).toBe("8642");
    expect(a.payout).toBe("86.42");
  });
  it("splits evenly with leftover cents assigned, never lost", () => {
    const a = allocate({ total: "100.00", currency: "USD", mode: "even", recipients });
    expect(a.items.map((i) => i.amountMinor)).toEqual(["3334", "3333", "3333"]);
  });
  it("requires fixed amounts to add up exactly", () => {
    expect(() => allocate({ total: "100", currency: "USD", mode: "fixed", recipients: [{ label: "A", email: "a@example.com", share: "60" }, { label: "B", email: "b@example.com", share: "30" }] })).toThrow(/not 100.00/);
  });
  it("rejects percentages that don't add up, bad emails, duplicates and unsupported currencies", () => {
    expect(() => allocate({ total: "10", currency: "USD", mode: "percent", recipients: [{ label: "A", email: "a@example.com", share: "50" }] })).toThrow(/100/);
    expect(() => allocate({ total: "10", currency: "USD", mode: "percent", recipients: [{ label: "A", email: "not-an-email", share: "100" }] })).toThrow(/email/);
    expect(() => allocate({ total: "10", currency: "USD", mode: "even", recipients: [{ label: "A", email: "a@example.com" }, { label: "B", email: "A@example.com" }] })).toThrow(/repeats/);
    expect(() => allocate({ total: "10", currency: "JPY", mode: "even", recipients })).toThrow(/Currency/);
  });
  it("refuses a share that would round to nothing", () => {
    expect(() => allocate({ total: "0.02", currency: "USD", mode: "even", recipients })).toThrow(/nothing/);
  });
});

describe("approval intents", () => {
  const input = { allocation: allocate({ total: "96.02", currency: "USD", mode: "percent", recipients }) };

  it("describes a payout exactly: only non-reserve recipients, in cents", () => {
    const intent = intentFor("paypal.payout", { subject: "Your share" }, input);
    expect(intent).toMatchObject({ kind: "payout", currency: "USD", totalMinor: "8642", items: [{ receiver: "creator@example.com", amountMinor: "6722" }, { receiver: "agency@example.com", amountMinor: "1920" }] });
  });

  it("fingerprints change when any amount or recipient changes", () => {
    const a = intentHash(intentFor("paypal.payout", { subject: "x" }, input));
    const b = intentHash(intentFor("paypal.payout", { subject: "x" }, { allocation: allocate({ total: "96.03", currency: "USD", mode: "percent", recipients }) }));
    const c = intentHash(intentFor("paypal.payout", { subject: "x" }, { allocation: allocate({ total: "96.02", currency: "USD", mode: "percent", recipients: [{ ...recipients[0], email: "other@example.com" }, recipients[1], recipients[2]] }) }));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(intentHash(intentFor("paypal.payout", { subject: "x" }, input))).toBe(a);
  });

  it("lets an action run only with a matching approval", () => {
    const hash = intentHash(intentFor("paypal.payout", { subject: "x" }, input));
    expect(() => requireApproved("payout", "paypal.payout", { subject: "x" }, input)).toThrow(/Human approval/);
    expect(() => requireApproved("payout", "paypal.payout", { subject: "x" }, { ...input, approval: { decision: "rejected", actions: { payout: hash } } })).toThrow();
    expect(requireApproved("payout", "paypal.payout", { subject: "x" }, { ...input, approval: { decision: "approved", actions: { payout: hash } } })).toMatchObject({ kind: "payout" });
    expect(() => requireApproved("payout", "paypal.payout", { subject: "changed" }, { ...input, approval: { decision: "approved", actions: { payout: hash } } })).toThrow(/changed after it was approved/);
  });

  it("describes refunds and invoice sends", () => {
    expect(intentFor("paypal.refund", { captureId: "3C679366HH908993F", amount: "25", currency: "USD" }, {})).toMatchObject({ kind: "refund", amountMinor: "2500" });
    expect(intentFor("paypal.refund", { captureId: "3C679366HH908993F" }, {})).toMatchObject({ kind: "refund", amountMinor: null });
    expect(() => intentFor("paypal.refund", { captureId: "{{ trigger.x }}" }, {})).toThrow();
    const inv = intentFor("paypal.send_invoice", { mode: "remind", subject: "Hi", note: "default" }, { invoices: [{ id: "INV2-AAAA-BBBB-CCCC", number: "0042", message: "Custom" }, { id: "INV2-DDDD-EEEE-FFFF", number: "0043" }] });
    expect(inv).toMatchObject({ kind: "invoice_remind", invoices: [{ note: "Custom" }, { note: "default" }] });
    expect(() => intentFor("paypal.send_invoice", { mode: "send" }, { invoices: [] })).toThrow(/No invoices/);
  });

  it("plans only side-effect nodes on the Approved branch", () => {
    const graph: WorkflowGraph = {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      nodes: [
        { id: "t", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
        { id: "ok", type: "logic.approval", position: { x: 0, y: 0 }, config: { message: "?", timeoutHours: 1 } },
        { id: "payout", type: "paypal.payout", position: { x: 0, y: 0 }, config: { subject: "{{ input.allocation.currency }} share" } },
        { id: "log", type: "util.log", position: { x: 0, y: 0 }, config: { message: "x" } },
        { id: "refund", type: "paypal.refund", position: { x: 0, y: 0 }, config: { captureId: "3C679366HH908993F" } },
      ],
      edges: [
        { id: "1", source: "t", sourcePort: "main", target: "ok", targetPort: "main" },
        { id: "2", source: "ok", sourcePort: "approved", target: "payout", targetPort: "main" },
        { id: "3", source: "ok", sourcePort: "approved", target: "log", targetPort: "main" },
        { id: "4", source: "ok", sourcePort: "rejected", target: "refund", targetPort: "main" },
      ],
    };
    const scope: Scope = { input, trigger: {}, nodes: {}, run: { id: "r", workflowId: "w" } };
    const actions = planActions(graph, "ok", input, scope);
    expect(actions.map((a) => a.nodeId)).toEqual(["payout"]);
    expect(actions[0].intent).toMatchObject({ subject: "USD share" });
    expect(plannedHash(actions)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("PayPal webhook parsing", () => {
  const key = "abcdefghijklmnopqrstuvwx";
  it("finds the Money Lego reference on captures, orders and invoices", () => {
    const capture = { id: "WH-1AB23456CD789012E-3FG45678HJ901234K", event_type: "PAYMENT.CAPTURE.COMPLETED", resource_type: "capture", resource: { id: "3C679366HH908993F", custom_id: referenceFor(key), status: "COMPLETED" } };
    const e = parseEvent(Buffer.from(JSON.stringify(capture)));
    expect(e).toMatchObject({ eventType: "PAYMENT.CAPTURE.COMPLETED", resourceId: "3C679366HH908993F", reference: `ml:${key}` });
    expect(keyFromReference(e.reference)).toBe(key);

    const order = { id: "WH-2AB23456CD789012E-3FG45678HJ901234K", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "5O190127TN364715T", purchase_units: [{ custom_id: referenceFor(key) }] } };
    expect(parseEvent(Buffer.from(JSON.stringify(order))).reference).toBe(`ml:${key}`);

    const invoice = { id: "WH-3AB23456CD789012E-3FG45678HJ901234K", event_type: "INVOICING.INVOICE.PAID", resource: { invoice: { id: "INV2-AAAA-BBBB-CCCC-DDDD", detail: { reference: referenceFor(key) } } } };
    expect(parseEvent(Buffer.from(JSON.stringify(invoice)))).toMatchObject({ resourceId: "INV2-AAAA-BBBB-CCCC-DDDD", reference: `ml:${key}` });
  });
  it("uses the batch id for payout batch events", () => {
    const batch = { id: "WH-4AB23456CD789012E-3FG45678HJ901234K", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS", resource: { batch_header: { payout_batch_id: "8YHCP7PZ4S9VL", batch_status: "SUCCESS" } } };
    expect(parseEvent(Buffer.from(JSON.stringify(batch))).resourceId).toBe("8YHCP7PZ4S9VL");
  });
  it("rejects events without a PayPal event id and ignores foreign references", () => {
    expect(() => parseEvent(Buffer.from(JSON.stringify({ event_type: "X" })))).toThrow();
    expect(keyFromReference("someone-else")).toBeNull();
    expect(keyFromReference("ml:short")).toBeNull();
  });
});
