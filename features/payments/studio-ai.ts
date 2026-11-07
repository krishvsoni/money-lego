"use client";

import type { AgAiEvent, AgAiOutputItem, AgLlmAdapter, AgLlmRequest, AgLlmResponse } from "ag-studio";

// Connects AG Studio's built-in dashboard agents to Money Lego's server-side model. Each turn
// is one request to /api/studio/llm; the answer is replayed to Studio as AG-UI events
// (text message, tool calls) and as the final output items. The model key never reaches the
// browser, and these agents can only change the dashboard, never PayPal or a workflow.

interface ServerTurn {
  model: string | null;
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  error?: { message?: string };
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

async function callServer(request: AgLlmRequest, signal?: AbortSignal): Promise<ServerTurn> {
  const res = await fetch("/api/studio/llm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    signal,
    body: JSON.stringify({ instructions: request.instructions, input: request.input, tools: request.tools, toolChoice: request.toolChoice, responseFormat: request.responseFormat }),
  });
  const json = (await res.json().catch(() => null)) as (ServerTurn & { error?: { message?: string } }) | null;
  if (!res.ok || !json) throw new Error(json?.error?.message ?? "The AI model didn't answer. Try again in a moment.");
  return json;
}

export const moneyLegoStudioAdapter: AgLlmAdapter = {
  executeTurn(request, options) {
    const turn = callServer(request, options?.signal);

    const response: Promise<AgLlmResponse> = turn.then(
      (t) => {
        const output: AgAiOutputItem[] = [];
        if (t.content) output.push({ id: nextId("msg"), kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: t.content, annotations: [] }] });
        for (const call of t.toolCalls) output.push({ id: nextId("fc"), kind: "output", type: "function_call", callId: call.id, name: call.name, arguments: call.arguments, status: "completed" });
        return {
          id: nextId("resp"),
          createdAt: Date.now(),
          status: "completed",
          output,
          model: t.model ?? undefined,
          ...(t.usage ? { usage: { inputTokens: t.usage.prompt_tokens ?? 0, outputTokens: t.usage.completion_tokens ?? 0, totalTokens: t.usage.total_tokens ?? 0 } } : {}),
        };
      },
      (error: unknown) => ({
        id: nextId("resp"),
        createdAt: Date.now(),
        status: "failed",
        output: [],
        error: { code: "model_error", message: error instanceof Error ? error.message : "The AI model didn't answer." },
      }),
    );

    async function* events(): AsyncGenerator<AgAiEvent> {
      const r = await response;
      if (r.status === "failed") {
        yield { type: "RUN_ERROR", message: r.error?.message ?? "The AI model didn't answer.", code: r.error?.code };
        return;
      }
      for (const item of r.output) {
        if (item.type === "message") {
          const text = item.content.map((c) => (c.type === "text" ? c.text : "")).join("");
          yield { type: "TEXT_MESSAGE_START", messageId: item.id, role: "assistant" };
          yield { type: "TEXT_MESSAGE_CONTENT", messageId: item.id, delta: text };
          yield { type: "TEXT_MESSAGE_END", messageId: item.id };
        } else if (item.type === "function_call") {
          yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name };
          yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments };
          yield { type: "TOOL_CALL_END", toolCallId: item.callId };
        }
      }
    }

    return { stream: { [Symbol.asyncIterator]: () => events() }, complete: response };
  },
};

export const STUDIO_PROMPTS = [
  { label: "Payouts dashboard", prompt: "Build a payouts page: total paid out, payout problems, paid out by workflow, and a ledger of payout items with status." },
  { label: "Revenue by week", prompt: "Show captured revenue by week and by workflow." },
  { label: "Run health", prompt: "Add a page for workflow run health: runs by status, runs by trigger, and failed runs over time." },
];
