import { z } from "zod";
import { isRawAmount, sumRaw } from "./amounts";
import { isSolanaAddress } from "./solana-address";
import { findToken } from "./tokens";

export const MAX_DESTINATIONS = 20;
export const HOPS_MIN = 3;
export const HOPS_MAX = 10;
export const ARRIVAL_MIN_SECONDS = 60;
export const ARRIVAL_MAX_SECONDS = 2_592_000;

const address = z.string().trim().refine(isSolanaAddress, "Not a valid Solana address");

const rawAmount = z
  .string()
  .refine(isRawAmount, "Amount must be a whole number of base units")
  .refine((v) => BigInt(v) > 0n, "Amount must be greater than zero");

export const destinationSchema = z.object({
  wallet: address,
  amountRaw: rawAmount,
  label: z.string().trim().max(60, "Keep labels under 60 characters").optional().default(""),
});

// Standard routing is the only mode enabled for launch. Custom routes and route templates
// are mutually exclusive with these fields upstream, so they get their own variants later.
export const routeSchema = z.object({
  mode: z.literal("standard"),
  hops: z.number().int().min(HOPS_MIN).max(HOPS_MAX).optional(),
  arrivalSeconds: z.number().int().min(ARRIVAL_MIN_SECONDS).max(ARRIVAL_MAX_SECONDS).optional(),
});

export const recipeConfigSchema = z
  .object({
    tokenMint: z.string(),
    destinations: z.array(destinationSchema).min(1, "Add at least one recipient").max(MAX_DESTINATIONS),
    route: routeSchema,
  })
  .superRefine((config, ctx) => {
    if (!findToken(config.tokenMint)) {
      ctx.addIssue({ code: "custom", path: ["tokenMint"], message: "This token is not supported on this network" });
    }
    const seen = new Map<string, number>();
    config.destinations.forEach((d, i) => {
      const first = seen.get(d.wallet);
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["destinations", i, "wallet"],
          message: `Same wallet as recipient ${first + 1}. Each recipient must be a different wallet.`,
        });
      } else {
        seen.set(d.wallet, i);
      }
    });
  });

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1, "Give the recipe a name").max(80),
  description: z.string().trim().max(280).optional().default(""),
  config: recipeConfigSchema,
});

export type Destination = z.infer<typeof destinationSchema>;
export type RouteConfig = z.infer<typeof routeSchema>;
export type RecipeConfig = z.infer<typeof recipeConfigSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;

export function totalRaw(config: Pick<RecipeConfig, "destinations">): bigint {
  return sumRaw(config.destinations.map((d) => d.amountRaw));
}
