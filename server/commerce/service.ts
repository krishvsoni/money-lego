import "server-only";
import { z } from "zod";
import { isCurrency, toMinor } from "@/lib/paypal/types";
import { askJson, ownerTag } from "../ai/model";
import type { SessionUser } from "../auth/session";
import { env } from "../config/env";
import { collections } from "../db/collections";
import { errors, isAppError } from "../errors";
import { channel3Configured, getProduct, searchProducts, type ProductSummary } from "../integrations/channel3";
import { log } from "../log";
import * as paypal from "../paypal/api";
import { PaypalError } from "../paypal/client";
import { maskEmail, recordResource } from "../paypal/resources";

// Agentic commerce: an AI shopping assistant grounded in Channel3's real product data, with
// the buyer approving a PayPal checkout. The AI only ranks and explains products Channel3
// returned (ids are checked against the response); the price charged is re-read from
// Channel3 on the server when the order is created, never taken from the browser or the model.

const pickSchema = z.object({
  summary: z.string().min(1).max(500),
  picks: z.array(z.object({ id: z.string().min(1).max(64), reason: z.string().min(1).max(300) })).max(3),
});

export interface AssistantResult {
  configured: { channel3: boolean; paypal: boolean };
  summary: string;
  aiRanked: boolean;
  products: Array<ProductSummary & { reason: string | null; recommended: boolean }>;
}

export async function assistantSearch(user: SessionUser, request: string, maxPrice: number | null): Promise<AssistantResult> {
  const configured = { channel3: channel3Configured(), paypal: Boolean(env().PAYPAL_CLIENT_ID && env().PAYPAL_CLIENT_SECRET) };
  if (!configured.channel3) throw errors.notConfigured("Channel3 product search (CHANNEL3_API_KEY)");
  const products = (await searchProducts({ query: request, maxPrice, limit: 8 })).filter((p) => p.price && isCurrency(p.currency ?? ""));
  if (!products.length) return { configured, summary: "Channel3 found no in-stock products in a supported currency for that request.", aiRanked: false, products: [] };

  let picks: z.infer<typeof pickSchema> | null = null;
  try {
    picks = await askJson({
      tag: ownerTag(user.userId),
      schema: pickSchema,
      system:
        "You are a shopping assistant. From the products given (and only those), pick up to 3 that best match the request and explain each in one sentence using only the listed facts (title, brand, price, rating, features, merchant). Never invent specs, discounts or availability. Use the exact product ids.",
      user: JSON.stringify({ request: request.slice(0, 300), maxPrice, products: products.map(({ id, title, brand, price, currency, rating, features, merchant, availability }) => ({ id, title, brand, price, currency, rating, features, merchant, availability })) }),
    });
  } catch (error) {
    log.warn("commerce.ai_unavailable", { error: isAppError(error) ? error.code : "unknown" });
  }
  const known = new Set(products.map((p) => p.id));
  const valid = (picks?.picks ?? []).filter((p) => known.has(p.id));
  const reasons = new Map(valid.map((p) => [p.id, p.reason]));
  const ordered = [...products].sort((a, b) => Number(reasons.has(b.id)) - Number(reasons.has(a.id)));
  return {
    configured,
    summary: valid.length ? picks!.summary : "Showing Channel3's top results (the AI ranking wasn't available).",
    aiRanked: valid.length > 0,
    products: ordered.map((p) => ({ ...p, reason: reasons.get(p.id) ?? null, recommended: reasons.has(p.id) })),
  };
}

const owner = (user: SessionUser) => ({ ownerId: user.userId, workflowId: null, runId: null, nodeId: null });

export async function createShopOrder(user: SessionUser, productId: string, requestKey: string): Promise<{ id: string; title: string; price: string; currency: string }> {
  const product = await getProduct(productId);
  const currency = (product.currency ?? "").toUpperCase();
  if (!product.price || !isCurrency(currency)) throw errors.validation("This product has no price in a currency PayPal checkout supports here.");
  if (product.availability && product.availability !== "InStock") throw errors.invalidState("This product is no longer in stock.");
  const minor = toMinor(product.price);
  const order = await paypal.createOrder({
    currency: currency as "USD",
    amountMinor: minor,
    itemName: product.title,
    description: `${product.brand ? `${product.brand} · ` : ""}${product.merchant ?? "Channel3 product"}`,
    customId: `mlshop:${productId}`.slice(0, 127),
    requestId: `ml-shop-${user.userId.toHexString()}-${requestKey}`,
  });
  await recordResource({
    kind: "order",
    paypalId: order.id,
    status: order.status,
    amount: { currency_code: currency, value: product.price },
    counterparty: product.merchant,
    detail: { source: "channel3", channel3Id: product.id, product: product.title.slice(0, 120) },
    owner: owner(user),
  });
  return { id: order.id, title: product.title, price: product.price, currency };
}

export async function captureShopOrder(user: SessionUser, orderId: string) {
  if (!/^[A-Z0-9]{6,40}$/i.test(orderId)) throw errors.validation("That isn't a PayPal order id.");
  const { paypalResources } = await collections();
  // Only an order this account created through the assistant can be captured here.
  const mine = await paypalResources.findOne({ kind: "order", paypalId: orderId, ownerId: user.userId, "detail.source": "channel3" });
  if (!mine) throw errors.forbidden();
  let order: paypal.OrderObject;
  try {
    order = await paypal.captureOrder(orderId, `ml-shopcap-${orderId}`);
  } catch (error) {
    if (error instanceof PaypalError && error.issue === "ORDER_ALREADY_CAPTURED") order = await paypal.getOrder(orderId);
    else throw error;
  }
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  await recordResource({ kind: "order", paypalId: order.id, status: order.status });
  if (capture) {
    await recordResource({
      kind: "capture",
      paypalId: capture.id,
      status: capture.status,
      amount: capture.amount,
      counterparty: maskEmail(order.payer?.email_address),
      detail: { orderId: order.id, source: "channel3", product: mine.detail.product ?? null },
      owner: owner(user),
    });
  }
  return { status: order.status, captureId: capture?.id ?? null, captureStatus: capture?.status ?? null };
}
