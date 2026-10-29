import "server-only";
import { NextResponse } from "next/server";
import { isAppError } from "../errors";
import { log } from "../log";
import type { CrewEvent, Emit } from "./crew";

// Streams crew progress as one JSON object per line. Auth, origin, rate limit and body
// checks have already run in the route wrapper, so those fail as ordinary JSON errors; a
// failure once the stream is open becomes a final { type: "error" } line instead.
export function crewStream(requestId: string, run: (emit: Emit) => Promise<void>): NextResponse {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: CrewEvent | { type: "error"; message: string }) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await run(send);
      } catch (error) {
        if (!isAppError(error)) log.error("agent.crew_failed", { requestId, error });
        // AppError messages are written for users; anything else stays in the logs.
        send({ type: "error", message: isAppError(error) ? error.message : "Sage hit a problem on our side. Nothing was changed." });
      } finally {
        controller.close();
      }
    },
  });
  return new NextResponse(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId, "x-accel-buffering": "no" },
  });
}
