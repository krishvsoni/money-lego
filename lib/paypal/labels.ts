import { nodeDefinition } from "@/lib/nodes/registry";

// Plain words for what the UI shows: PayPal's status codes and run statuses, and trigger
// block types. Anything unlisted falls back to sentence case, never a raw CODE_LIKE_THIS.

// PayPal's status codes in plain words; anything unlisted is shown in sentence case.
export const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  SUCCESS: "Paid",
  PAID: "Paid",
  MARKED_AS_PAID: "Paid",
  PARTIALLY_PAID: "Part paid",
  PARTIALLY_REFUNDED: "Part refunded",
  REFUNDED: "Refunded",
  PENDING: "Pending",
  PROCESSING: "Processing",
  NEW: "Processing",
  CREATED: "Created",
  APPROVED: "Approved",
  SAVED: "Saved",
  PAYER_ACTION_REQUIRED: "Waiting for buyer",
  UNCLAIMED: "Not claimed yet",
  ONHOLD: "On hold",
  SENT: "Sent",
  UNPAID: "Unpaid",
  REMINDED: "Reminded",
  DRAFT: "Draft",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  CANCELLED: "Cancelled",
  CANCELED: "Cancelled",
  DENIED: "Declined",
  DECLINED: "Declined",
  FAILED: "Failed",
  RETURNED: "Returned",
  BLOCKED: "Blocked",
  REVERSED: "Reversed",
  succeeded: "Succeeded",
  failed: "Failed",
  waiting: "Waiting",
  running: "Running",
  queued: "Queued",
  cancelled: "Cancelled",
};
export const statusLabel = (v: string) => STATUS_LABEL[v] ?? (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/_/g, " ") : "—");
export const triggerLabel = (type: string): string => nodeDefinition(type)?.title ?? type.replace("trigger.", "").replace(/_/g, " ");
