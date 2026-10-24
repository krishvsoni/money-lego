import { MAX_DESTINATIONS } from "../../recipe-schema";
import { MAIN_IN, MAIN_OUT, type NodeDefinition } from "../types";

export const VALUE_TYPES = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True/false" },
  { value: "address", label: "Solana address" },
  { value: "object", label: "Object" },
  { value: "array", label: "List" },
];

export const dataNodes: NodeDefinition[] = [
  {
    type: "data.validate",
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
  {
    type: "data.split",
    title: "Split allocation",
    category: "data",
    description: "Turn a total into exact per-recipient token amounts. Shares always add up to the last base unit.",
    icon: "Split",
    fields: [
      { key: "tokenMint", label: "Token", kind: "token", required: true },
      {
        key: "mode",
        label: "Split by",
        kind: "select",
        required: true,
        options: [
          { value: "percent", label: "Percentages of a total" },
          { value: "even", label: "Even shares of a total" },
          { value: "fixed", label: "Fixed amount per recipient" },
        ],
      },
      { key: "total", label: "Total amount", kind: "text", expression: true, placeholder: "{{ input.amount }}", help: "In whole tokens, e.g. 1250.50. Not used for fixed amounts." },
      {
        key: "recipients",
        label: "Recipients",
        kind: "pairs",
        max: MAX_DESTINATIONS,
        addLabel: "Add recipient",
        required: true,
        columns: [
          { key: "wallet", label: "Wallet", kind: "text", placeholder: "Solana address" },
          { key: "share", label: "Share", kind: "text", placeholder: "40" },
          { key: "label", label: "Label", kind: "text", placeholder: "Design" },
        ],
      },
    ],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { mode: "percent", total: "{{ input.amount }}", recipients: [{ wallet: "", share: "100", label: "" }] },
    retrySafe: true,
    outputHint: "{ tokenMint, decimals, amountRaw, destinations: [{ wallet, amountRaw, label }] } in base units.",
  },
];
