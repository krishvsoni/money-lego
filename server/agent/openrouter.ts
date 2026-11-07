import "server-only";
import { env } from "../config/env";
import { AppError, errors } from "../errors";
import { log } from "../log";

// The only code that talks to OpenRouter. The key stays server-side and the provider's
// error bodies never reach the browser: callers see one of a few plain app errors. Replies
// stream, so the crew can show a plan taking shape while the model is still writing it.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// A model that goes quiet for this long is treated as stalled; one that keeps streaming may
// take up to the hard cap, since reasoning models think for a while before they write.
const IDLE_MS = 30_000;
const CAP_MS = 120_000;
// Free models that support JSON output, strongest first. Free models come and go, so
// OPENROUTER_MODELS overrides this with up to nine of your own.
const DEFAULT_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
  "recursive/flint-v1.0:free",
  "google/gemma-4-26b-a4b-it:free",
  "xingchen-agi/xing4.0-29b-a4b:free",
  "dots-studio/dots-3-note-preview:free",
];
// OpenRouter falls through a group of models within one request; when a whole group is
// down, rate limited or answers badly, the next group gets a fresh request.
const GROUP_SIZE = 3;
const MAX_MODELS = 9;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionHooks {
  // The reply so far, called as chunks arrive; used to sketch the plan early.
  onText?: (soFar: string) => void;
  // Plain-language progress for the activity log.
  onLog?: (line: string) => void;
}

function modelGroups(): string[][] {
  const configured = env().OPENROUTER_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  const list = (configured?.length ? configured : DEFAULT_MODELS).slice(0, MAX_MODELS);
  const groups: string[][] = [];
  for (let i = 0; i < list.length; i += GROUP_SIZE) groups.push(list.slice(i, i + GROUP_SIZE));
  return groups;
}


// Models wrap JSON in prose or code fences often enough that we take the outermost object.
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the model reply");
  return JSON.parse(text.slice(start, end + 1));
}

const unavailable = () => new AppError("AGENT_UNAVAILABLE", 503, "The AI models are busy right now. Try again shortly, or start from a template.");
const badOutput = () => new AppError("AGENT_BAD_OUTPUT", 502, "The agent's answer wasn't usable. Try rephrasing with the trigger, the data source and who gets paid.");

// Reads OpenRouter's server-sent events: `data: {json}` lines, `: comment` keep-alives and a
// final `data: [DONE]`. An error can also arrive mid-stream as a chunk with `error` set.
async function readStream(res: Response, hooks: CompletionHooks, alive: () => void): Promise<{ text: string; model: string | null }> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  let model: string | null = null;
  let reasoning = false;
  let writing = false;
  for (;;) {
    const { value, done } = await reader.read();
    alive();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return { text, model };
      let chunk: { model?: string; error?: unknown; choices?: Array<{ delta?: { content?: string; reasoning?: string } }> };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.error) throw unavailable();
      if (chunk.model && !model) {
        model = chunk.model;
        // Which model answered is an operator detail: it goes to the server log only.
        log.info("agent.model", { model: chunk.model });
      }
      if (chunk.choices?.[0]?.delta?.reasoning && !reasoning) {
        reasoning = true;
        hooks.onLog?.("Reasoning it through before writing the plan");
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        if (!writing) {
          writing = true;
          hooks.onLog?.("Writing the plan");
        }
        text += delta;
        hooks.onText?.(text);
      }
    }
  }
  return { text, model };
}

async function completeOnce(messages: ChatMessage[], userTag: string, models: string[], hooks: CompletionHooks): Promise<unknown> {
  const e = env();
  if (!e.OPENROUTER_API_KEY) throw errors.notConfigured("The workflow agent");
  hooks.onLog?.("Thinking about how to build it");

  const abort = new AbortController();
  const cap = setTimeout(() => abort.abort(), CAP_MS);
  let idle = setTimeout(() => abort.abort(), IDLE_MS);
  const alive = () => {
    clearTimeout(idle);
    idle = setTimeout(() => abort.abort(), IDLE_MS);
  };
  const stop = () => {
    clearTimeout(cap);
    clearTimeout(idle);
  };

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
        models,
        messages,
        stream: true,
        temperature: 0.2,
        // Free models are often reasoning models whose thinking counts against this limit;
        // low effort keeps them fast and leaves room for the full plan.
        max_tokens: 8_000,
        // Reasoning is streamed but never shown; its arrival is only a sign of life.
        reasoning: { effort: "low" },
        response_format: { type: "json_object" },
        // A hashed, opaque tag lets OpenRouter attribute abuse without learning who the user is.
        user: userTag,
      }),
      signal: abort.signal,
      cache: "no-store",
    });
  } catch (error) {
    stop();
    log.warn("agent.network", { error: error instanceof Error ? error.name : "unknown" });
    throw unavailable();
  }

  if (!res.ok || !res.body) stop();
  if (res.status === 429) throw errors.rateLimited(Number(res.headers.get("retry-after")) || 20);
  if (!res.ok || !res.body) {
    log.warn("agent.http", { status: res.status });
    throw unavailable();
  }

  let reply: { text: string; model: string | null };
  try {
    reply = await readStream(res, hooks, alive);
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("agent.stream", { error: error instanceof Error ? error.name : "unknown" });
    throw unavailable();
  } finally {
    stop();
  }
  try {
    return extractJson(reply.text);
  } catch {
    log.warn("agent.unparseable", { model: reply.model, length: reply.text.length });
    throw badOutput();
  }
}

// Each group gets one request. Only failures another model could fix move on to the next
// group: a timeout or outage, a rate limit, or an unusable answer. Anything else (a missing
// key) is the same for every model, so it stops at once.
const FALL_THROUGH = new Set(["AGENT_UNAVAILABLE", "AGENT_BAD_OUTPUT", "RATE_LIMITED"]);

export async function completeJson(messages: ChatMessage[], userTag: string, hooks: CompletionHooks = {}): Promise<unknown> {
  let last: unknown;
  const groups = modelGroups();
  for (const [i, group] of groups.entries()) {
    try {
      return await completeOnce(messages, userTag, group, hooks);
    } catch (error) {
      if (!(error instanceof AppError) || !FALL_THROUGH.has(error.code)) throw error;
      log.warn("agent.group_failed", { models: group, code: error.code });
      if (i < groups.length - 1) hooks.onLog?.(error.code === "AGENT_BAD_OUTPUT" ? "That answer didn't make sense, trying again" : "Busy right now, trying again");
      last = error;
    }
  }
  throw last;
}

// One non-streaming chat completion with tool calling, for agents that run their own loop
// (AG Studio's dashboard agents). Same key handling and model fallback as completeJson.
export interface ChatCompletionBody {
  messages: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: unknown;
  response_format?: unknown;
}
export interface ChatCompletionResult {
  model: string | null;
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  finishReason: string | null;
}

export async function chatCompletion(body: ChatCompletionBody, userTag: string): Promise<ChatCompletionResult> {
  const e = env();
  if (!e.OPENROUTER_API_KEY) throw errors.notConfigured("The AI model");
  let last: unknown = unavailable();
  for (const models of modelGroups()) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${e.OPENROUTER_API_KEY}`, "content-type": "application/json", "http-referer": e.APP_URL, "x-title": "Money Lego" },
        body: JSON.stringify({ models, ...body, temperature: 0.2, max_tokens: 6_000, user: userTag }),
        signal: AbortSignal.timeout(CAP_MS),
        cache: "no-store",
      });
    } catch (error) {
      log.warn("agent.network", { error: error instanceof Error ? error.name : "unknown" });
      last = unavailable();
      continue;
    }
    if (res.status === 429) {
      last = errors.rateLimited(Number(res.headers.get("retry-after")) || 20);
      continue;
    }
    if (!res.ok) {
      log.warn("agent.http", { status: res.status });
      last = unavailable();
      continue;
    }
    const json = (await res.json().catch(() => null)) as {
      model?: string;
      error?: unknown;
      usage?: ChatCompletionResult["usage"];
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>;
    } | null;
    const choice = json?.choices?.[0];
    if (!json || json.error || !choice?.message) {
      last = unavailable();
      continue;
    }
    return {
      model: json.model ?? null,
      content: choice.message.content ?? "",
      toolCalls: (choice.message.tool_calls ?? []).filter((t) => t.function?.name).map((t, i) => ({ id: t.id || `call_${Date.now()}_${i}`, name: t.function!.name!, arguments: t.function!.arguments || "{}" })),
      usage: json.usage ?? null,
      finishReason: choice.finish_reason ?? null,
    };
  }
  throw last;
}
