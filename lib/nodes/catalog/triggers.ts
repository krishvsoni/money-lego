import { isTimeZone } from "../../workflow/schedule";
import { MAIN_OUT, type ConfigIssue, type NodeDefinition } from "../types";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, i) => ({ value: String(i), label }));

function scheduleIssues(config: Record<string, unknown>): ConfigIssue[] {
  if (config.mode === "weekly") {
    const issues: ConfigIssue[] = [];
    if (!WEEKDAYS.some((d) => d.value === String(config.weekday ?? ""))) issues.push({ field: "weekday", message: "Pick a day" });
    if (!config.time) issues.push({ field: "time", message: "Time is required for weekly runs" });
    if (!isTimeZone(String(config.timezone ?? ""))) issues.push({ field: "timezone", message: "Pick a timezone, e.g. America/New_York" });
    return issues;
  }
  const n = Number(config.intervalMinutes);
  return Number.isFinite(n) && n >= 5 ? [] : [{ field: "intervalMinutes", message: "Every (minutes) must be at least 5" }];
}

export const triggerNodes: NodeDefinition[] = [
  {
    type: "trigger.manual",
    summary: "Run it yourself with one click.",
    title: "Manual trigger",
    category: "triggers",
    description: "Start the workflow from the editor with an optional test payload.",
    icon: "MousePointerClick",
    fields: [{ key: "samplePayload", label: "Test payload", kind: "json", help: "JSON passed to the next node when you click Run.", placeholder: '{ "amount": "100" }' }],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { samplePayload: "{}" },
    retrySafe: true,
    outputHint: "The test payload object.",
  },
  {
    type: "trigger.webhook",
    summary: "Start when your app sends a signed request.",
    title: "Webhook trigger",
    category: "triggers",
    description: "Start the workflow when a signed HTTP POST arrives. Unsigned requests are refused.",
    icon: "Webhook",
    fields: [
      {
        key: "credentialId",
        label: "Signing secret",
        kind: "credential",
        credentialType: "webhook_secret",
        required: true,
        help: "Senders sign the raw body with HMAC-SHA256 and send it as x-money-lego-signature: sha256=<hex>.",
      },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: {},
    retrySafe: true,
    outputHint: "{ body, receivedAt, deliveryId }. The body is whatever the sender posted, verified but not trusted as proof of payment.",
  },
  {
    type: "trigger.schedule",
    summary: "Run on a repeating timer.",
    title: "Schedule trigger",
    category: "triggers",
    description: "Start the workflow on an interval or every week at a set time while it's enabled. Money steps still wait for your approval and wallet.",
    icon: "CalendarClock",
    provider: "schedule",
    fields: [
      {
        key: "mode",
        label: "Repeat",
        kind: "select",
        required: true,
        options: [
          { value: "interval", label: "Every few minutes or hours" },
          { value: "weekly", label: "Once a week" },
        ],
      },
      { key: "intervalMinutes", label: "Every (minutes)", kind: "number", min: 5, max: 10_080, step: 5, help: "Used when repeating on an interval." },
      { key: "weekday", label: "Day", kind: "select", options: WEEKDAYS, help: "Used when repeating weekly." },
      { key: "time", label: "Time (24h)", kind: "text", placeholder: "15:00", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", patternMessage: "Use HH:MM, e.g. 15:00" },
      { key: "timezone", label: "Timezone", kind: "text", placeholder: "Europe/Berlin", help: "An IANA timezone name. Weekly runs follow its daylight saving changes." },
      { key: "payload", label: "Payload", kind: "json", help: "JSON passed to the next node on each run." },
    ],
    inputs: [],
    outputs: MAIN_OUT,
    defaults: { mode: "interval", intervalMinutes: 60, payload: "{}" },
    retrySafe: true,
    outputHint: "{ payload, scheduledFor }.",
    validate: scheduleIssues,
  },
];
