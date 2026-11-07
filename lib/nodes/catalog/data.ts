import { CURRENCIES } from "../../paypal/types";
import { MAIN_IN, MAIN_OUT, type NodeDefinition } from "../types";

export const MAX_RECIPIENTS = 15;

export const VALUE_TYPES = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True/false" },
  { value: "email", label: "Email address" },
  { value: "object", label: "Object" },
  { value: "array", label: "List" },
];

export const dataNodes: NodeDefinition[] = [
  {
    type: "data.allocate",
    summary: "Split an amount into exact shares, to the cent.",
    title: "Split allocation",
    category: "data",
    description:
      "Divide an amount between recipients by percentage, evenly or as fixed amounts. Works in whole cents, so the shares always add up exactly; any leftover cent is assigned visibly, never lost. A row without an email is a reserve the business keeps: it is calculated and shown but never paid out. Calculates only; it moves nothing.",
    icon: "Split",
    fields: [
      { key: "total", label: "Amount to split", kind: "text", required: true, expression: true, placeholder: "{{ trigger.net }}", help: "A decimal amount, e.g. the capture's net after PayPal's fee." },
      { key: "currency", label: "Currency", kind: "text", required: true, expression: true, placeholder: "{{ trigger.currency }}", help: `One of ${CURRENCIES.join(", ")}.` },
      {
        key: "mode",
        label: "Split by",
        kind: "select",
        required: true,
        options: [
          { value: "percent", label: "Percentages" },
          { value: "even", label: "Even shares" },
          { value: "fixed", label: "Fixed amounts" },
        ],
      },
      {
        key: "recipients",
        label: "Recipients",
        kind: "pairs",
        max: MAX_RECIPIENTS,
        addLabel: "Add recipient",
        required: true,
        help: "Leave the email empty for a share the business keeps. Use sandbox test accounts in the demo.",
        columns: [
          { key: "label", label: "Who", kind: "text", placeholder: "Creator" },
          { key: "email", label: "PayPal email", kind: "text", placeholder: "creator@example.com" },
          { key: "share", label: "Share", kind: "text", placeholder: "70" },
        ],
      },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { total: "{{ trigger.net }}", currency: "{{ trigger.currency }}", mode: "percent", recipients: [{ label: "", email: "", share: "100" }] },
    retrySafe: true,
    outputHint: "The input plus { allocation: { currency, total, totalMinor, payoutMinor, items: [{ receiver, label, amountMinor, keep }] } }.",
  },
  {
    type: "data.validate",
    summary: "Check data before it's used.",
    title: "Validate data",
    category: "data",
    description: "Check that fields exist and have the right type. Fails the run with a clear list if not.",
    icon: "ShieldCheck",
    fields: [
      {
        key: "rules",
        label: "Rules",
        kind: "pairs",
        max: 20,
        addLabel: "Add rule",
        required: true,
        columns: [
          { key: "path", label: "Field", kind: "text", placeholder: "amount" },
          { key: "type", label: "Must be", kind: "select", options: VALUE_TYPES },
        ],
      },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { rules: [{ path: "", type: "string" }] },
    retrySafe: true,
    outputHint: "The input, unchanged, once every rule passes.",
  },
  {
    type: "data.map",
    summary: "Reshape data from earlier steps.",
    title: "Map data",
    category: "data",
    description: "Build a new object from fields earlier in the run.",
    icon: "Shuffle",
    fields: [
      { key: "keepInput", label: "Keep input fields", kind: "boolean", help: "Off returns only the fields below." },
      {
        key: "fields",
        label: "Fields",
        kind: "pairs",
        max: 30,
        addLabel: "Add field",
        required: true,
        expression: true,
        columns: [
          { key: "key", label: "Name", kind: "text", placeholder: "amount" },
          { key: "value", label: "Value", kind: "text", placeholder: "{{ input.body.amount }}" },
        ],
      },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { keepInput: true, fields: [{ key: "", value: "" }] },
    retrySafe: true,
    outputHint: "The mapped object.",
  },
];
