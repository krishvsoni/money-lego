import { createHash } from "node:crypto";
import { z } from "zod";
import { chatCompletion } from "@/server/agent/openrouter";
import { readBody, route } from "@/server/http/handler";
import { RATE_RULES } from "@/server/http/rate-limit";
import { errors } from "@/server/errors";

// The model behind AG Studio's dashboard agents. The browser sends one AG Studio turn
// (instructions, conversation, tool schemas); we translate it to an OpenAI-compatible
// request and call the model server-side, so no AI key ever reaches the browser. The agents
// only change the dashboard on the page; they have no access to PayPal or any workflow.

const item = z.object({ type: z.string(), role: z.string().optional(), content: z.unknown().optional(), callId: z.string().optional(), name: z.string().optional(), arguments: z.string().optional(), output: z.string().optional() }).passthrough();
const bodySchema = z.object({
  instructions: z.string().max(200_000).optional(),
  input: z.array(item).max(400),
  tools: z.array(z.object({ name: z.string().max(128), description: z.string().max(20_000).optional(), parameters: z.unknown() })).max(128).optional(),
  toolChoice: z.union([z.enum(["auto", "none", "required"]), z.object({ name: z.string() })]).optional(),
  responseFormat: z.object({ type: z.enum(["text", "json"]), name: z.string().optional(), schema: z.unknown().optional() }).optional(),
});

const text = (content: unknown): string =>
  Array.isArray(content) ? content.map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text ?? "") : "")).join("") : typeof content === "string" ? content : "";

export const POST = route({ auth: true, rate: RATE_RULES.studio }, async ({ req, user }) => {
  const parsed = bodySchema.safeParse(JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8")));
  if (!parsed.success) throw errors.validation("That AI request wasn't in the expected shape.");
  const b = parsed.data;

  const messages: Array<Record<string, unknown>> = [];
  const system = [b.instructions, b.responseFormat?.type === "json" ? `Reply with JSON only, matching this JSON schema:\n${JSON.stringify(b.responseFormat.schema ?? {})}` : ""].filter(Boolean).join("\n\n");
  if (system) messages.push({ role: "system", content: system });
  for (const it of b.input) {
    if (it.type === "message") {
      const role = it.role === "assistant" ? "assistant" : it.role === "system" ? "system" : "user";
      messages.push({ role, content: text(it.content) });
    } else if (it.type === "function_call" && it.callId && it.name) {
      const call = { id: it.callId, type: "function", function: { name: it.name, arguments: it.arguments ?? "{}" } };
      const prev = messages.at(-1);
      // Consecutive tool calls belong to one assistant message.
      if (prev?.role === "assistant" && Array.isArray(prev.tool_calls)) (prev.tool_calls as unknown[]).push(call);
      else messages.push({ role: "assistant", content: null, tool_calls: [call] });
    } else if (it.type === "function_call_output" && it.callId) {
      messages.push({ role: "tool", tool_call_id: it.callId, content: it.output ?? "" });
    }
  }

  const tools = b.tools?.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.parameters ?? { type: "object", properties: {} } } }));
  const toolChoice = !tools?.length ? undefined : typeof b.toolChoice === "object" ? { type: "function", function: { name: b.toolChoice.name } } : b.toolChoice;
  const tag = createHash("sha256").update(`money-lego-studio:${user.userId.toHexString()}`).digest("hex").slice(0, 32);
  return chatCompletion({ messages, ...(tools?.length ? { tools, tool_choice: toolChoice } : {}), ...(b.responseFormat?.type === "json" ? { response_format: { type: "json_object" } } : {}) }, tag);
});
