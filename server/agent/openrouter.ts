import "server-only";
import { env } from "../config/env";
import { AppError, errors } from "../errors";
import { log } from "../log";

// The only code that talks to OpenRouter. The key stays server-side and the provider's
// error bodies never reach the browser: callers see one of three plain app errors.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 60_000;
// Free models come and go; OpenRouter falls through this list when one is down or busy.
const DEFAULT_MODELS = ["nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free", "recursive/flint-v1.0:free"];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function models(): string[] {
  const configured = env().OPENROUTER_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return (configured?.length ? configured : DEFAULT_MODELS).slice(0, 3);
}

// Models wrap JSON in prose or code fences often enough that we take the outermost object.
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the model reply");
  return JSON.parse(text.slice(start, end + 1));
}

async function completeOnce(messages: ChatMessage[], userTag: string): Promise<unknown> {
  const e = env();
  if (!e.OPENROUTER_API_KEY) throw errors.notConfigured("The workflow agent");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${e.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
        "http-referer": e.APP_URL,
        "x-title": "Money Lego",
      },
      body: JSON.stringify({
        models: models(),
        messages,
        temperature: 0.2,
        // Free models are often reasoning models whose thinking counts against this limit;
        // low effort keeps them fast and leaves room for the full plan.
        max_tokens: 8_000,
        reasoning: { effort: "low", exclude: true },
        response_format: { type: "json_object" },
        // A hashed, opaque tag lets OpenRouter attribute abuse without learning who the user is.
        user: userTag,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    log.warn("agent.network", { error: error instanceof Error ? error.name : "unknown" });
    throw new AppError("AGENT_UNAVAILABLE", 503, "The drafting agent didn't answer in time. Try again in a moment.");
  }

  if (res.status === 429) throw errors.rateLimited(Number(res.headers.get("retry-after")) || 20);
  if (!res.ok) {
    log.warn("agent.http", { status: res.status });
    throw new AppError("AGENT_UNAVAILABLE", 503, "The drafting agent is unavailable right now. Try again shortly, or start from a template.");
  }

  const body = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; model?: string } | null;
  const content = body?.choices?.[0]?.message?.content ?? "";
  try {
    return extractJson(content);
  } catch {
    log.warn("agent.unparseable", { model: body?.model, length: content.length, finish: body?.choices?.[0]?.finish_reason });
    throw new AppError("AGENT_BAD_OUTPUT", 502, "The agent's answer wasn't usable. Try rephrasing with the trigger, the data source and who gets paid.");
  }
}

// An empty or cut-off reply is usually one slow or overloaded free model; one more try is
// routed afresh and usually lands. Provider outages and rate limits are not retried here.
export async function completeJson(messages: ChatMessage[], userTag: string): Promise<unknown> {
  try {
    return await completeOnce(messages, userTag);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "AGENT_BAD_OUTPUT") throw error;
    return completeOnce(messages, userTag);
  }
}
