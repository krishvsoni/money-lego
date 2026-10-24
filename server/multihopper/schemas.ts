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
  quotedAt: nullableString,
  expiresAt: nullableString,
  completedAt: nullableString,
});

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
