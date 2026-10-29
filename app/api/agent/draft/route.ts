import { NextResponse } from "next/server";
import { runCrew, type CrewEvent } from "@/server/agent/draft";
import { draftRequestSchema } from "@/server/agent/schema";
import { isAppError } from "@/server/errors";
import { route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { log } from "@/server/log";

export const maxDuration = 120;

// Auth, origin, rate limit and body checks run before the stream opens, so those failures
// are ordinary JSON errors. After that, progress streams as one JSON object per line, and
// a failure mid-way is a final { type: "error" } line with a message safe to show.
export const POST = route({ auth: true, rate: RATE_RULES.agent, body: draftRequestSchema }, async ({ user, body, requestId }) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CrewEvent | { type: "error"; message: string }) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runCrew(user, body.prompt, body.requestKey, send);
      } catch (error) {
        if (!isAppError(error)) log.error("agent.crew_failed", { requestId, error });
        // AppError messages are written for users; anything else stays in the logs.
        send({ type: "error", message: isAppError(error) ? error.message : "Mason hit a problem on our side. Nothing was saved." });
      } finally {
        controller.close();
      }
    },
  });
  return new NextResponse(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId, "x-accel-buffering": "no" },
  });
});
