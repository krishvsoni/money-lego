import { z } from "zod";

// Response shapes from docs/MULTIHOPPER_INTEGRATION.md (OpenAPI reviewed 2026-10-24).
// Parsing is deliberately loose: unknown fields pass through and optional fields default,
// so a provider adding a field never breaks us, while a missing required field fails loudly.

const nullableInt = z.number().int().nullable().optional().transform((v) => v ?? null);
const nullableString = z.string().nullable().optional().transform((v) => v ?? null);

export const estimateSchema = z.looseObject({
  percentFeeBps: z.number().optional(),
  percentFeeRaw: z.string(),
  totalFlatFeeLamports: z.number().optional(),
  hopAmountRaw: z.string().optional(),
  isTestMode: z.boolean().optional(),
  sol: z
    .looseObject({
      requiredSolUpFrontLamports: z.number().optional(),
      refundableLamports: z.number().optional(),
      netCostLamports: z.number().optional(),
    })
    .optional(),
});

const destinationSchema = z.looseObject({
  wallet: z.string(),
  amountRaw: z.string(),
  status: z.string().optional().default("pending"),
  payoutSignature: nullableString,
  paidAt: nullableString,
});

export const transferSchema = z.looseObject({
  id: z.number().int(),
  externalId: nullableString,
  supportBundleId: nullableString,
  amountRaw: z.string(),
  recipientReceivesRaw: z.string().optional().default("0"),
  percentFeeRaw: z.string().optional().default("0"),
  percentFeeBps: nullableInt,
  totalFlatFeeLamports: nullableInt,
  hops: z.number().int().optional().default(0),
  arrivalSeconds: z.number().int().optional().default(0),
  pricingTier: nullableString,
  status: z.string(),
  phase: nullableString,
  isTest: z.boolean().optional().default(false),
  destinations: z.array(destinationSchema).nullable().optional().transform((v) => v ?? []),
  progress: z.object({ hopsCompleted: z.number(), hopsTotal: z.number() }).nullable().optional().transform((v) => v ?? null),
  lastError: z
    .object({ code: z.string(), message: z.string(), at: z.string().optional() })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  recovery: z
    .looseObject({
      canRescue: z.boolean().optional().default(false),
      rescuableLamports: z.number().optional().default(0),
      canReclaimRent: z.boolean().optional().default(false),
      reclaimableLamports: z.number().optional().default(0),
    })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  quotedAt: nullableString,
  expiresAt: nullableString,
  completedAt: nullableString,
});

// Rescue and reclaim bundles share a shape; only the array and summary names differ.
const recoveryTx = z.union([z.string(), z.looseObject({ base64: z.string() })]).transform((t) => (typeof t === "string" ? t : t.base64));

export const rescueBundleSchema = z.looseObject({
  rescueTxs: z.array(recoveryTx),
  lastValidBlockHeight: nullableInt,
  rescuable: z.looseObject({ totalLamports: z.number().optional().default(0) }).optional(),
});

export const reclaimBundleSchema = z.looseObject({
  reclaimTxs: z.array(recoveryTx),
  lastValidBlockHeight: nullableInt,
  reclaimable: z.looseObject({ totalLamports: z.number().optional().default(0) }).optional(),
});

export const reclaimConfirmSchema = z.looseObject({
  confirmed: z.array(z.string()).optional().default([]),
  failed: z.array(z.looseObject({ signature: z.string(), error: z.string().optional() })).optional().default([]),
});

export const usageSchema = z.looseObject({
  totalTransfers: z.number(),
  completedTransfers: z.number(),
  failedTransfers: z.number(),
  totalVolumeRaw: z.string(),
  totalFlatFeeEarned: z.number(),
  totalPayouts: z.number().optional().default(0),
  tokenFeesEarned: z.array(z.looseObject({ tokenMint: z.string(), tokenDecimals: z.number().optional(), amountRaw: z.string() })).optional().default([]),
  isTestMode: z.boolean().optional(),
});

export const webhookEndpointSchema = z.looseObject({
  id: z.number().int(),
  url: z.string(),
  events: z.array(z.string()).optional().default([]),
  secret: z.string().optional(),
  createdAt: z.string().optional(),
});

export const listOf = <T extends z.ZodType>(item: T) =>
  z.union([z.array(item), z.looseObject({ items: z.array(item) }).transform((v) => v.items)]);

const base64Array = z
  .array(z.union([z.string(), z.object({ base64: z.string() })]))
  .nullable()
  .optional()
  .transform((items) => (items ?? []).map((i) => (typeof i === "string" ? i : i.base64)));

export const prepareSchema = z.looseObject({
  transfer: z.looseObject({ id: z.number().int(), status: z.string() }),
  preparedTxs: z.looseObject({
    keeperFundingTx: nullableString,
    routeInitTxs: base64Array,
    orchestratorInitTx: nullableString,
    sessionInitTxs: base64Array,
    dispersionInitTxs: base64Array,
    lastValidBlockHeight: nullableInt,
    resume: z.looseObject({ nothingToDo: z.boolean().optional() }).nullable().optional(),
  }),
});

export const confirmSchema = z.looseObject({
  transfer: z.looseObject({ id: z.number().int(), status: z.string() }),
});

export type Estimate = z.infer<typeof estimateSchema>;
export type ProviderTransfer = z.infer<typeof transferSchema>;
export type PrepareResult = z.infer<typeof prepareSchema>;
export type Usage = z.infer<typeof usageSchema>;
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;
