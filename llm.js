/**
 * llm.js
 *
 * Provider-agnostic LLM layer. Exposes a single runLlmTurn() that speaks
 * Anthropic's message/tool shape internally and converts to the target
 * provider's format on the wire.
 *
 * Providers:
 *   anthropic  - Anthropic API (default)
 *   local      - any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM,
 *                llama.cpp server, Jan, text-generation-webui, …)
 *
 * Configure with env vars:
 *   MODEL_PROVIDER        - "anthropic" (default) | "local"
 *   LOCAL_MODEL_BASE_URL  - e.g. http://localhost:11434/v1 (Ollama)
 *   LOCAL_MODEL_NAME      - e.g. llama3.1:8b, qwen2.5:32b, mistral-small
 *   LOCAL_MODEL_API_KEY   - optional; most local servers ignore it
 *   LOCAL_MODEL_MAX_TOKENS- optional cap for max_tokens per turn
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import "dotenv/config";

const PROVIDER = (process.env.MODEL_PROVIDER || "anthropic").toLowerCase();

let anthropicClient = null;
let openaiClient = null;

function getAnthropic() {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

function getOpenAi() {
  if (!openaiClient) {
    const baseURL = process.env.LOCAL_MODEL_BASE_URL || "http://localhost:11434/v1";
    const apiKey = process.env.LOCAL_MODEL_API_KEY || "not-needed";
    // Default 30 min — CPU inference on a 10 GB model with many tools can
    // push past the OpenAI SDK's 10 min default, especially on the first
    // turn when the prompt is cold.
    const timeout = parseInt(process.env.LOCAL_MODEL_TIMEOUT_MS || "1800000", 10);
    openaiClient = new OpenAI({ baseURL, apiKey, timeout });
  }
  return openaiClient;
}

export function getProvider() {
  return PROVIDER;
}

/**
 * Pick the right model name for this provider + mode.
 */
export function resolveModel(mode) {
  if (PROVIDER === "local") {
    return process.env.LOCAL_MODEL_NAME || "llama3.1:8b";
  }
  return mode === "heartbeat"
    ? process.env.MODEL_HEARTBEAT || "claude-haiku-4-5-20251001"
    : process.env.MODEL_INTERACTIVE || "claude-sonnet-4-6";
}

/**
 * Run one LLM turn.
 *
 * @param {object} p
 * @param {string} p.model       Model name for the chosen provider
 * @param {string} p.system      System prompt
 * @param {Array}  p.tools       Anthropic-shaped tools: {name, description, input_schema}
 * @param {Array}  p.messages    Anthropic-shaped message array
 * @param {number} [p.maxTokens] Token cap (default 4096)
 *
 * @returns {{ stopReason: "end_turn"|"tool_use", content: Array }}
 *   content is always an array of Anthropic-shaped blocks:
 *     { type: "text", text }
 *     { type: "tool_use", id, name, input }
 */
export async function runLlmTurn({ model, system, tools, messages, maxTokens }) {
  const cap =
    maxTokens ||
    (PROVIDER === "local"
      ? parseInt(process.env.LOCAL_MODEL_MAX_TOKENS || "4096", 10)
      : 4096);

  if (PROVIDER === "local") {
    return runLocalTurn({ model, system, tools, messages, maxTokens: cap });
  }
  return runAnthropicTurn({ model, system, tools, messages, maxTokens: cap });
}

async function runAnthropicTurn({ model, system, tools, messages, maxTokens }) {
  const resp = await getAnthropic().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools,
    messages,
  });
  return { stopReason: resp.stop_reason, content: resp.content };
}

async function runLocalTurn({ model, system, tools, messages, maxTokens }) {
  const oai = getOpenAi();
  const payload = {
    model,
    max_tokens: maxTokens,
    messages: toOpenAiMessages(system, messages),
  };
  if (tools && tools.length) payload.tools = toOpenAiTools(tools);

  const resp = await oai.chat.completions.create(payload);
  const choice = resp.choices?.[0];
  const msg = choice?.message || {};

  const content = [];
  if (typeof msg.content === "string" && msg.content.length) {
    content.push({ type: "text", text: msg.content });
  }
  if (Array.isArray(msg.tool_calls)) {
    for (const tc of msg.tool_calls) {
      let input = {};
      const rawArgs = tc.function?.arguments;
      if (typeof rawArgs === "string" && rawArgs.length) {
        try {
          input = JSON.parse(rawArgs);
        } catch (err) {
          console.warn(
            `[llm] Local model returned non-JSON tool arguments for ${tc.function?.name}: ${err.message}`
          );
          input = { _raw: rawArgs };
        }
      } else if (rawArgs && typeof rawArgs === "object") {
        input = rawArgs;
      }
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function?.name,
        input,
      });
    }
  }

  const hasToolUse = content.some((b) => b.type === "tool_use");
  const stopReason =
    choice?.finish_reason === "tool_calls" || hasToolUse ? "tool_use" : "end_turn";

  return { stopReason, content };
}

/**
 * Convert Anthropic-shaped tools to OpenAI function-tool format.
 */
function toOpenAiTools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || "",
      parameters: t.input_schema || { type: "object", properties: {} },
    },
  }));
}

/**
 * Convert a system string + Anthropic-shaped message array into an
 * OpenAI chat.completions message array.
 */
function toOpenAiMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: "system", content: system });

  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") {
        out.push({ role: "user", content: m.content });
        continue;
      }
      for (const block of m.content || []) {
        if (block.type === "tool_result") {
          out.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content:
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content),
          });
        } else if (block.type === "text") {
          out.push({ role: "user", content: block.text });
        }
      }
      continue;
    }

    if (m.role === "assistant") {
      const textParts = [];
      const toolCalls = [];
      for (const block of m.content || []) {
        if (block.type === "text") textParts.push(block.text);
        else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          });
        }
      }
      const msg = {
        role: "assistant",
        content: textParts.join("\n") || null,
      };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
    }
  }

  return out;
}
