import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { matchSlackMention, verifySlack, type SlackEvent } from "@/server/engine/inbound/providers";
import { InboundRejected } from "@/server/engine/inbound/types";
import { slackBuyMeFlowers } from "@/server/templates/definitions/slack-buy-me-flowers";

const SECRET = "8f742231b10e8888abcd99yyyzzz85a5".replace(/[^0-9a-f]/g, "0");
const NOW = 1_794_400_000_000;

function signed(body: unknown, { secret = SECRET, at = NOW } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const ts = String(Math.floor(at / 1000));
  const sig = `v0=${createHmac("sha256", secret).update(`v0:${ts}:`).update(raw).digest("hex")}`;
  return { raw, headers: new Headers({ "x-slack-signature": sig, "x-slack-request-timestamp": ts }) };
}

const message = (text: string, user = "U0NEHA0001", extra: Record<string, unknown> = {}) => ({
  type: "event_callback",
  team_id: "T0TEAM0001",
  event_id: "Ev0ABC12345",
  event: { type: "message", channel: "C0GENERAL1", user, text, ts: "1794400000.000100", ...extra },
});

describe("verifySlack", () => {
  it("answers Slack's URL check", () => {
    const { raw, headers } = signed({ type: "url_verification", challenge: "abc123" });
    expect(verifySlack(raw, headers, SECRET, NOW)).toEqual({ kind: "challenge", challenge: "abc123" });
  });

  it("reads a person's message and the people it tags", () => {
    const { raw, headers } = signed(message("<@U0KRISH001> buy me flowers please"));
    expect(verifySlack(raw, headers, SECRET, NOW)).toMatchObject({ kind: "message", teamId: "T0TEAM0001", userId: "U0NEHA0001", mentions: ["U0KRISH001"] });
  });

  it("rejects a wrong secret, a stale timestamp and a missing signature", () => {
    const wrong = signed(message("hi"), { secret: "0".repeat(32) });
    expect(() => verifySlack(wrong.raw, wrong.headers, SECRET, NOW)).toThrow(InboundRejected);
    const stale = signed(message("hi"), { at: NOW - 10 * 60_000 });
    expect(() => verifySlack(stale.raw, stale.headers, SECRET, NOW)).toThrow(/tolerance/);
    expect(() => verifySlack(Buffer.from("{}"), new Headers(), SECRET, NOW)).toThrow(/Missing/);
  });

  it("ignores bots, edits and other event types", () => {
    for (const body of [message("buy me flowers", "U0NEHA0001", { bot_id: "B1" }), message("buy me flowers", "U0NEHA0001", { subtype: "message_changed" }), { type: "event_callback", team_id: "T0TEAM0001", event_id: "Ev0ABC12345", event: { type: "reaction_added" } }]) {
      const { raw, headers } = signed(body);
      expect(verifySlack(raw, headers, SECRET, NOW).kind).toBe("other");
    }
  });
});

describe("matchSlackMention", () => {
  const read = (text: string, user = "U0NEHA0001") => {
    const { raw, headers } = signed(message(text, user));
    return verifySlack(raw, headers, SECRET, NOW) as Extract<SlackEvent, { kind: "message" }>;
  };

  it("starts on the phrase in any case, tagging the first other person", () => {
    expect(matchSlackMention({ phrase: "buy me flowers" }, read("Hey <@U0KRISH001> BUY me Flowers?"))).toEqual({
      eventId: "Ev0ABC12345",
      teamId: "T0TEAM0001",
      channelId: "C0GENERAL1",
      requesterId: "U0NEHA0001",
      taggedUserId: "U0KRISH001",
      request: "Hey BUY me Flowers?",
      ts: "1794400000.000100",
    });
  });

  it("needs the phrase and someone tagged who isn't the author", () => {
    expect(matchSlackMention({ phrase: "buy me flowers" }, read("<@U0KRISH001> lunch?"))).toBeNull();
    expect(matchSlackMention({ phrase: "buy me flowers" }, read("buy me flowers"))).toBeNull();
    expect(matchSlackMention({ phrase: "buy me flowers" }, read("<@U0NEHA0001> buy me flowers"))).toBeNull();
    expect(matchSlackMention({ phrase: "" }, read("<@U0KRISH001> buy me flowers"))).toBeNull();
  });

  it("with a tagged person set, only that person counts", () => {
    expect(matchSlackMention({ phrase: "buy me flowers", taggedUserId: "U0KRISH001" }, read("<@U0OTHER001> buy me flowers"))).toBeNull();
    expect(matchSlackMention({ phrase: "buy me flowers", taggedUserId: "U0KRISH001" }, read("<@U0OTHER001> <@U0KRISH001> buy me flowers"))?.taggedUserId).toBe("U0KRISH001");
  });
});

describe("Slack: Buy Me Flowers template", () => {
  const nodes = Object.fromEntries(slackBuyMeFlowers.graphDefinition.nodes.map((n) => [n.id, n]));
  const next = (id: string, port = "main") => slackBuyMeFlowers.graphDefinition.edges.filter((e) => e.source === id && e.sourcePort === port).map((e) => e.target);

  it("DMs the payment link to the tagged person after approval, then tells the channel once paid", () => {
    expect(nodes.mention.type).toBe("trigger.slack_mention");
    expect(next("approval", "approved")).toEqual(["checkout"]);
    expect(next("checkout")).toEqual(["dm"]);
    expect(nodes.dm.type).toBe("notify.slack_dm");
    expect(nodes.dm.config.userId).toBe("{{ trigger.taggedUserId }}");
    expect(String(nodes.dm.config.message)).toContain("{{ input.checkout.approveUrl }}");
    expect(next("dm")).toEqual(["wait"]);
    expect(next("wait")).toEqual(["announce"]);
    expect(String(nodes.announce.config.message)).toMatch(/<@\{\{ trigger\.taggedUserId \}\}> bought flowers for <@\{\{ trigger\.requesterId \}\}>/);
  });
});
