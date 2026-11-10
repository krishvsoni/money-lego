import "server-only";
import { env } from "../config/env";
import { AppError, errors } from "../errors";
import { log } from "../log";

// The only code that talks to model providers. Every call names a tier:
//  - "main": the agents (Sage's planner and fixer, the Money Lego assistant and its PayPal
//    sub-agent, AG Studio's dashboard agents) run on OpenAI, falling back to OpenRouter.
//  - "small": bounded node tasks (AI review, write, pick, run explanations) run on OpenRouter,
//    falling back to OpenAI's small model.
// Keys stay server-side and provider error bodies never reach the browser: callers see one of
// a few plain app errors. JSON replies stream, so the crew can show a plan taking shape.

// "fast": a small task someone is waiting on (explaining a run): OpenAI's small model first,
// free OpenRouter models only as a fallback, since those can queue for a long time.
export type Tier = "main" | "small" | "fast";

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI = "https://api.openai.com/v1/chat/completions";
// A model that goes quiet for this long is treated as stalled; one that keeps streaming may
// take up to the hard cap, since reasoning models think for a while before they write.
const IDLE_MS = 45_000;
const CAP_MS = 150_000;
// Free OpenRouter models that support JSON output, strongest first. OPENROUTER_MODELS overrides.
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

// One place to send a request: a provider, its key and the model(s) to name.
interface Target {
  provider: "openai" | "openrouter";
  label: string;
  models: string[];
}

function openRouterGroups(): Target[] {
  if (!env().OPENROUTER_API_KEY) return [];
  const configured = env().OPENROUTER_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  const list = (configured?.length ? configured : DEFAULT_MODELS).slice(0, MAX_MODELS);
  const groups: Target[] = [];
  for (let i = 0; i < list.length; i += GROUP_SIZE) groups.push({ provider: "openrouter", label: "OpenRouter", models: list.slice(i, i + GROUP_SIZE) });
  return groups;
}

function targetsFor(tier: Tier): Target[] {
  const e = env();
  const openai = (model: string): Target[] => (e.OPENAI_API_KEY ? [{ provider: "openai", label: "OpenAI", models: [model] }] : []);
  const list =
    tier === "main"
      ? [...openai(e.OPENAI_MODEL), ...openRouterGroups()]
      : tier === "fast"
        ? [...openai(e.OPENAI_SMALL_MODEL), ...openRouterGroups()]
        : [...openRouterGroups(), ...openai(e.OPENAI_SMALL_MODEL)];
  if (!list.length) throw errors.notConfigured("The AI model (OPENAI_API_KEY or OPENROUTER_API_KEY)");
  return list;
}

// Reasoning models (gpt-5.x, o-series) take max_completion_tokens and reasoning_effort, and
// only their default temperature.
const isReasoningModel = (model: string) => /^(gpt-5|gpt-6|o\d)/.test(model);

function requestFor(t: Target, body: Record<string, unknown>, userTag: string, maxTokens: number): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const e = env();
  if (t.provider === "openai") {
    const model = t.models[0];
    return {
      url: OPENAI,
      headers: { authorization: `Bearer ${e.OPENAI_API_KEY}`, "content-type": "application/json" },
      // On /v1/chat/completions, OpenAI's reasoning models accept function tools only with
      // reasoning_effort "none"; plain JSON turns keep a little reasoning.
      body: {
        model,
        ...body,
        ...(isReasoningModel(model) ? { max_completion_tokens: maxTokens, reasoning_effort: Array.isArray(body.tools) && body.tools.length ? "none" : "low" } : { max_tokens: maxTokens, temperature: 0.2 }),
        user: userTag,
      },
    };
  }
  return {
    url: OPENROUTER,
    headers: { authorization: `Bearer ${e.OPENROUTER_API_KEY}`, "content-type": "application/json", "http-referer": e.APP_URL, "x-title": "Money Lego" },
    body: { models: t.models, ...body, temperature: 0.2, max_tokens: maxTokens, reasoning: { effort: "low" }, user: userTag },
  };
}

// Models wrap JSON in prose or code fences often enough that we take the outermost object.
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the model reply");
  return JSON.parse(text.slice(start, end + 1));
}

const unavailable = () => new AppError("AGENT_UNAVAILABLE", 503, "The AI models are busy right now. Try again shortly, or start from a template.");
const badOutput = () => new AppError("AGENT_BAD_OUTPUT", 502, "The agent's answer wasn't usable. Try rephrasing with what starts it, what PayPal should do and who approves it.");

// Reads OpenAI-style server-sent events: `data: {json}` lines, `: comment` keep-alives and a
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

async function completeOnce(t: Target, messages: ChatMessage[], userTag: string, hooks: CompletionHooks): Promise<unknown> {
  // The provider and model are an operator detail (server log only), never shown to the user.
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

  const req = requestFor(t, { messages, stream: true, response_format: { type: "json_object" } }, userTag, 8_000);
  let res: Response;
  try {
    res = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: abort.signal, cache: "no-store" });
  } catch (error) {
    stop();
    log.warn("agent.network", { provider: t.provider, error: error instanceof Error ? error.name : "unknown" });
    throw unavailable();
  }
  if (!res.ok || !res.body) stop();
  if (res.status === 429) throw errors.rateLimited(Number(res.headers.get("retry-after")) || 20);
  if (!res.ok || !res.body) {
    log.warn("agent.http", { provider: t.provider, status: res.status });
    throw unavailable();
  }

  let reply: { text: string; model: string | null };
  try {
    reply = await readStream(res, hooks, alive);
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("agent.stream", { provider: t.provider, error: error instanceof Error ? error.name : "unknown" });
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

// Only failures another model could fix move on to the next target: a timeout or outage, a
// rate limit, or an unusable answer. Anything else is the same everywhere, so it stops.
const FALL_THROUGH = new Set(["AGENT_UNAVAILABLE", "AGENT_BAD_OUTPUT", "RATE_LIMITED"]);

export async function completeJson(messages: ChatMessage[], userTag: string, hooks: CompletionHooks = {}, tier: Tier = "main"): Promise<unknown> {
  let last: unknown = unavailable();
  const targets = targetsFor(tier);
  for (const [i, t] of targets.entries()) {
    try {
      return await completeOnce(t, messages, userTag, hooks);
    } catch (error) {
      if (!(error instanceof AppError) || !FALL_THROUGH.has(error.code)) throw error;
      log.warn("agent.target_failed", { provider: t.provider, models: t.models, code: error.code });
      if (i < targets.length - 1) hooks.onLog?.(error.code === "AGENT_BAD_OUTPUT" ? "That answer didn't make sense, trying again" : "Busy right now, trying again");
      last = error;
    }
  }
  throw last;
}

// One non-streaming chat completion with tool calling, for agents that run their own loop
// (the Money Lego assistant, the PayPal sub-agent, AG Studio's dashboard agents).
export interface ChatCompletionBody {
  messages: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: unknown;
  response_format?: unknown;
}
export interface ChatCompletionResult {
  provider: "openai" | "openrouter";
  model: string | null;
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  finishReason: string | null;
}

export async function chatCompletion(body: ChatCompletionBody, userTag: string, tier: Tier = "main"): Promise<ChatCompletionResult> {
  let last: unknown = unavailable();
  for (const t of targetsFor(tier)) {
    const req = requestFor(t, { ...body }, userTag, 6_000);
    let res: Response;
    try {
      res = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(CAP_MS), cache: "no-store" });
    } catch (error) {
      log.warn("agent.network", { provider: t.provider, error: error instanceof Error ? error.name : "unknown" });
      last = unavailable();
      continue;
    }
    if (res.status === 429) {
      last = errors.rateLimited(Number(res.headers.get("retry-after")) || 20);
      continue;
    }
    if (!res.ok) {
      log.warn("agent.http", { provider: t.provider, status: res.status });
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
      provider: t.provider,
      model: json.model ?? null,
      content: choice.message.content ?? "",
      toolCalls: (choice.message.tool_calls ?? []).filter((c) => c.function?.name).map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, name: c.function!.name!, arguments: c.function!.arguments || "{}" })),
      usage: json.usage ?? null,
      finishReason: choice.finish_reason ?? null,
    };
  }
  throw last;
}
