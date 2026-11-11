import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.fn();
vi.mock("@/server/engine/safe-fetch", () => ({ safeFetch: (...args: unknown[]) => safeFetch(...args) }));

import { resolveSlackUser, SlackLookupError, slackTarget } from "@/server/integrations/slack";

describe("slackTarget", () => {
  it("tells a member ID from an email", () => {
    expect(slackTarget("U0123ABCD")).toEqual({ kind: "id", id: "U0123ABCD" });
    expect(slackTarget(" Krish@Company.com ")).toEqual({ kind: "email", email: "krish@company.com" });
  });

  it("rejects anything else", () => {
    for (const bad of ["", "krish", "@krish", "<@U0123ABCD>", "a@b", "two words@x.com", null, undefined]) expect(slackTarget(bad), String(bad)).toEqual({ kind: "invalid" });
  });
});

describe("resolveSlackUser", () => {
  beforeEach(() => safeFetch.mockReset());

  it("passes a member ID straight through without calling Slack", async () => {
    expect(await resolveSlackUser("xoxb-token-aaaaaaaaaaaa", "U0123ABCD")).toBe("U0123ABCD");
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("looks an email up once, then remembers the person", async () => {
    safeFetch.mockResolvedValue({ status: 200, body: { ok: true, user: { id: "U0KRISH001" } } });
    expect(await resolveSlackUser("xoxb-token-bbbbbbbbbbbb", "krish@company.com")).toBe("U0KRISH001");
    expect(await resolveSlackUser("xoxb-token-bbbbbbbbbbbb", "KRISH@company.com")).toBe("U0KRISH001");
    expect(safeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = safeFetch.mock.calls[0];
    expect(url).toBe("https://slack.com/api/users.lookupByEmail?email=krish%40company.com");
    expect(init.headers.authorization).toBe("Bearer xoxb-token-bbbbbbbbbbbb");
  });

  it("says what to fix when the person isn't found or the permission is missing", async () => {
    safeFetch.mockResolvedValue({ status: 200, body: { ok: false, error: "users_not_found" } });
    await expect(resolveSlackUser("xoxb-token-cccccccccccc", "nobody@company.com")).rejects.toThrow(/No one in this Slack workspace uses nobody@company.com/);
    safeFetch.mockResolvedValue({ status: 200, body: { ok: false, error: "missing_scope" } });
    await expect(resolveSlackUser("xoxb-token-dddddddddddd", "neha@company.com")).rejects.toThrow(/Reconnect Slack/);
  });

  it("refuses text that is neither an email nor a member ID", async () => {
    await expect(resolveSlackUser("xoxb-token-eeeeeeeeeeee", "Krish")).rejects.toBeInstanceOf(SlackLookupError);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
