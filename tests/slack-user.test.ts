import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.fn();
vi.mock("@/server/engine/safe-fetch", () => ({ safeFetch: (...args: unknown[]) => safeFetch(...args) }));

import { resolveSlackUser, sendSlackDm, SlackLookupError, slackTarget } from "@/server/integrations/slack";

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
    await expect(resolveSlackUser("xoxb-token-dddddddddddd", "neha@company.com")).rejects.toThrow(/press Reconnect on your Slack connection/);
  });

  it("refuses text that is neither an email nor a member ID", async () => {
    await expect(resolveSlackUser("xoxb-token-eeeeeeeeeeee", "Krish")).rejects.toBeInstanceOf(SlackLookupError);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});

describe("sendSlackDm", () => {
  beforeEach(() => safeFetch.mockReset());
  const call = (i: number) => ({ url: safeFetch.mock.calls[i][0] as string, body: JSON.parse(safeFetch.mock.calls[i][1].body) });

  it("sends a direct message to the member", async () => {
    safeFetch.mockResolvedValue({ status: 200, body: { ok: true, channel: "D0KRISHDM1", ts: "1.2" } });
    expect(await sendSlackDm({ token: "xoxb-t", userId: "U0KRISH001", text: "Pay here" })).toEqual({ channel: "D0KRISHDM1", ts: "1.2", via: "dm" });
    expect(call(0)).toEqual({ url: "https://slack.com/api/chat.postMessage", body: { channel: "U0KRISH001", text: "Pay here" } });
  });

  it("when the app's Messages tab is off, sends it in the channel, visible only to that person", async () => {
    safeFetch.mockResolvedValueOnce({ status: 200, body: { ok: false, error: "messages_tab_disabled" } }).mockResolvedValueOnce({ status: 200, body: { ok: true, message_ts: "3.4" } });
    expect(await sendSlackDm({ token: "xoxb-t", userId: "U0KRISH001", text: "Pay here", fallbackChannel: "C0GENERAL1" })).toEqual({ channel: "C0GENERAL1", ts: "3.4", via: "private_note" });
    expect(call(1)).toEqual({ url: "https://slack.com/api/chat.postEphemeral", body: { channel: "C0GENERAL1", user: "U0KRISH001", text: "Pay here" } });
  });

  it("without a channel to fall back to, says exactly which Slack setting to turn on", async () => {
    safeFetch.mockResolvedValue({ status: 200, body: { ok: false, error: "messages_tab_disabled" } });
    await expect(sendSlackDm({ token: "xoxb-t", userId: "U0KRISH001", text: "Pay here" })).rejects.toThrow(/App Home, turn on Messages Tab/);
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it("explains the fix when the private note can't be sent either", async () => {
    safeFetch.mockResolvedValueOnce({ status: 200, body: { ok: false, error: "messages_tab_disabled" } }).mockResolvedValueOnce({ status: 200, body: { ok: false, error: "user_not_in_channel" } });
    await expect(sendSlackDm({ token: "xoxb-t", userId: "U0KRISH001", text: "Pay here", fallbackChannel: "C0GENERAL1" })).rejects.toBeInstanceOf(SlackLookupError);
  });
});
