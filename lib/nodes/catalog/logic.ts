import { MAIN_IN, MAIN_OUT, type Field, type NodeDefinition } from "../types";

export const OPERATORS = [
  { value: "equals", label: "is equal to" },
  { value: "notEquals", label: "is not equal to" },
  { value: "gt", label: "is greater than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "exists" },
];

const comparison: Field[] = [
  { key: "left", label: "Value", kind: "text", required: true, expression: true, placeholder: "{{ input.event }}" },
  { key: "operator", label: "Operator", kind: "select", options: OPERATORS, required: true },
  { key: "right", label: "Compare with", kind: "text", expression: true, placeholder: "payout.requested", help: "Numbers compare numerically when both sides are numbers." },
];

export const logicNodes: NodeDefinition[] = [
  {
    type: "logic.condition",
    summary: "Go one way if true, another if false.",
    title: "Condition",
    category: "logic",
    description: "Send the data down the true or false branch.",
    icon: "GitBranch",
    fields: comparison,
    inputs: MAIN_IN,
    outputs: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    defaults: { operator: "equals" },
    retrySafe: true,
    outputHint: "The input, unchanged, on the matching branch. The other branch is skipped.",
  },
  {
    type: "logic.filter",
    summary: "Continue only when a check passes.",
    title: "Filter",
    category: "logic",
    description: "Continue only when the check passes. Otherwise the branch stops quietly.",
    icon: "Filter",
    fields: comparison,
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { operator: "equals" },
    retrySafe: true,
    outputHint: "The input, unchanged, when the check passes.",
  },
  {
    type: "logic.approval",
    summary: "Wait for you to approve.",
    title: "Human approval",
    category: "logic",
    description:
      "Pause until the workflow owner approves or rejects in the run panel. The reviewer sees exactly what each PayPal action on the Approved branch will do (recipients, amounts, invoices), fingerprinted; if anything changes after approval, the action refuses to run.",
    icon: "UserCheck",
    fields: [
      { key: "message", label: "What to review", kind: "textarea", expression: true, required: true, maxLength: 500 },
      { key: "timeoutHours", label: "Expire after (hours)", kind: "number", min: 1, max: 168, required: true },
    ],
    inputs: MAIN_IN,
    outputs: [
      { id: "approved", label: "Approved" },
      { id: "rejected", label: "Rejected" },
    ],
    defaults: { message: "Approve this payout?", timeoutHours: 24 },
    retrySafe: true,
    outputHint: "The input plus { approval: { decision, by, at, payloadHash, actions } }.",
  },
  {
    type: "logic.once",
    summary: "Never act on the same thing twice.",
    title: "Once per key",
    category: "logic",
    description:
      "Claim a business key, such as an order, capture or invoice ID, for this workflow. If an earlier run already claimed it, this run stops. A key is only released when its run failed before any PayPal money action happened.",
    icon: "Fingerprint",
    fields: [{ key: "key", label: "Key", kind: "text", required: true, expression: true, maxLength: 200, placeholder: "capture:{{ trigger.captureId }}" }],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: {},
    retrySafe: true,
    outputHint: "The input plus { onceKey } after the key is claimed for this run.",
  },
];
