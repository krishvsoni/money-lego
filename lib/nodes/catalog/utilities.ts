import { MAIN_IN, MAIN_OUT, type NodeDefinition } from "../types";

export const utilityNodes: NodeDefinition[] = [
  {
    type: "util.delay",
    summary: "Pause for a set time.",
    title: "Delay",
    category: "utilities",
    description: "Wait before continuing. Durable: the run resumes even if no one has the editor open.",
    icon: "Hourglass",
    fields: [{ key: "minutes", label: "Wait (minutes)", kind: "number", min: 1, max: 10_080, required: true }],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { minutes: 5 },
    retrySafe: true,
    outputHint: "The input, unchanged.",
  },
  {
    type: "util.log",
    summary: "Write a note to the run log.",
    title: "Execution log",
    category: "utilities",
    description: "Write a line to this run's log.",
    icon: "ScrollText",
    fields: [{ key: "message", label: "Message", kind: "textarea", expression: true, required: true, maxLength: 500 }],
    inputs: MAIN_IN,
    outputs: MAIN_OUT,
    defaults: { message: "Run finished: {{ input.state }}" },
    retrySafe: true,
    outputHint: "The input, unchanged. The message appears in the run log.",
  },
];
