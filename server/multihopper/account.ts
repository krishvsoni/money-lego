import "server-only";
import { randomUUID } from "node:crypto";
import { providerRequest } from "./http";
import { listOf, usageSchema, webhookEndpointSchema, type Usage, type WebhookEndpoint } from "./schemas";

// Integration-level operations: they describe the whole Money Lego integration, not one
// user's transfers, so they are only reachable from operator scripts, never from an API route.

export async function getUsage(range: { fromDate?: string; toDate?: string } = {}): Promise<Usage> {
  const query = new URLSearchParams(Object.entries(range).filter(([, v]) => v) as Array<[string, string]>).toString();
  return usageSchema.parse(await providerRequest("GET", `/usage${query ? `?${query}` : ""}`));
}

export async function listWebhooks(): Promise<WebhookEndpoint[]> {
  return listOf(webhookEndpointSchema).parse(await providerRequest("GET", "/webhooks"));
}

// The response carries the signing secret exactly once; the caller must store it.
export async function createWebhook(url: string, events?: string[]): Promise<WebhookEndpoint> {
  const json = await providerRequest("POST", "/webhooks", {
    body: events?.length ? { url, events } : { url },
    idempotencyKey: randomUUID(),
  });
  return webhookEndpointSchema.parse(json);
}

export async function deleteWebhook(id: number): Promise<void> {
  await providerRequest("DELETE", `/webhooks/${id}`);
}
