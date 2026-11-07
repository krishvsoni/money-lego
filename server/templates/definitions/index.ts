import type { TemplateDefinition } from "@/lib/templates/types";
import { paypalInvoiceReminders } from "./paypal-invoice-reminders";
import { paypalRefundDesk } from "./paypal-refund-desk";
import { paypalSaleRevenueSplit } from "./paypal-sale-revenue-split";
import { paypalSubscriptionRecovery } from "./paypal-subscription-recovery";
import { paypalWeeklyOpsReport } from "./paypal-weekly-ops-report";

// Seed source for the published templates. The database is what the app serves; these are
// what the seed upserts into it, keyed by slug. Templates no longer listed are unpublished.
export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [paypalSaleRevenueSplit, paypalInvoiceReminders, paypalSubscriptionRecovery, paypalRefundDesk, paypalWeeklyOpsReport];
