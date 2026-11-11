import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.fn();
vi.mock("@/server/engine/safe-fetch", () => ({ safeFetch: (...args: unknown[]) => safeFetch(...args) }));
vi.mock("@/server/engine/executors/connectors", () => ({ connection: async () => ({ secret: { accessToken: "xoxb-test" }, account: { id: "T1", name: "Team" } }) }));

import { integrationExecutors } from "@/server/engine/executors/integrations";

// The Slack mention trigger step, given a run whose trigger data is `payload`.
const runTrigger = (payload: Record<string, unknown>) => {
  const log = vi.fn();
  const ctx = { run: { trigger: { payload } }, config: { credentialId: "c1" }, ownerId: {}, signal: new AbortController().signal, log } as never;
  return { result: integrationExecutors["trigger.slack_mention"](ctx), log };
};

describe("Slack mention trigger", () => {
  beforeEach(() => safeFetch.mockReset());

  it("turns people given by Slack email into member IDs, so later messages tag them by name", async () => {
    safeFetch.mockImplementation(async (url: string) => {
      const email = decodeURIComponent(/[?&]email=([^&]+)/.exec(url)?.[1] ?? "");
      const ids: Record<string, string> = { "neha@studio.com": "U07NEHA123", "krish@studio.com": "U07KRISH45" };
      return { status: 200, body: { ok: true, user: { id: ids[email] } } };
    });
    const { result, log } = runTrigger({ requesterId: "neha@studio.com", taggedUserId: "Krish@Studio.com", channelId: "C0GENERAL1", request: "buy me flowers" });
    await expect(result).resolves.toEqual({
      kind: "ok",
      port: "main",
      output: { requesterId: "U07NEHA123", taggedUserId: "U07KRISH45", channelId: "C0GENERAL1", request: "buy me flowers" },
    });
    expect(log).toHaveBeenCalledWith("Looked up requesterId and taggedUserId by Slack email.");
  });

  it("passes a real mention's member IDs through without calling Slack", async () => {
    const payload = { requesterId: "U07NEHA123", taggedUserId: "U07KRISH45", channelId: "C0GENERAL1" };
    await expect(runTrigger(payload).result).resolves.toMatchObject({ output: payload });
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("fails the step with a clear reason when no Slack user has that email", async () => {
    safeFetch.mockResolvedValue({ status: 200, body: { ok: false, error: "users_not_found" } });
    await expect(runTrigger({ requesterId: "U07NEHA123", taggedUserId: "nobody@studio.com" }).result).rejects.toThrow(/nobody@studio\.com|no Slack/i);
  });
});
