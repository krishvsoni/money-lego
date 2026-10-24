import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature, webhookDedupeKey } from "@/server/multihopper/webhook-signature";

const secret = "whsec_test_secret";
const body = Buffer.from('{"type":"transfer.completed","data":{"id":42}}');
const sign = (b: Buffer) => createHmac("sha256", secret).update(b).digest("hex");

describe("verifyWebhookSignature", () => {
  it("accepts the exact body", () => {
    expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true);
    expect(verifyWebhookSignature(body, `sha256=${sign(body)}`, secret)).toBe(true);
  });
  it("rejects a body changed by one byte", () => {
    const tampered = Buffer.from(body.toString().replace("42", "43"));
    expect(verifyWebhookSignature(tampered, sign(body), secret)).toBe(false);
  });
  it("rejects missing, malformed and wrong-length signatures without throwing", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "nothex", secret)).toBe(false);
    expect(verifyWebhookSignature(body, "ab", secret)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), "whsec_other")).toBe(false);
  });
  it("dedupes identical bodies", () => {
    expect(webhookDedupeKey(body)).toBe(webhookDedupeKey(Buffer.from(body)));
  });
});
