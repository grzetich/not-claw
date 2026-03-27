/**
 * agent.js
 *
 * The brain. Uses the Anthropic SDK with Notion MCP for tool-use. Each call
 * to runAgent() connects to the Notion MCP server, discovers tools, and runs
 * an agentic loop: Claude reasons, calls Notion MCP tools, and returns a
 * final text response.
 *
 * Notion workspace layout:
 *   Soul page    — who the agent is, persona, owner preferences (stable)
 *   Memory page  — what the agent knows and has learned (grows over time)
 *   Skills DB    — pages of instructions, searchable and writable by agent
 *   Tasks DB     — task queue with status, priority, notes
 *   Heartbeat log — record of every proactive run
 */

import Anthropic from "@anthropic-ai/sdk";
import { getTools, callTool, connectMcp } from "./mcp-client.js";
import "dotenv/config";

const client = new Anthropic();
const AGENT_NAME = process.env.AGENT_NAME || "Alfred";
const MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 20;

/**
 * Builds the system prompt for each agent session.
 */
export function buildSystemPrompt(mode) {
  const ids = {
    soul:      process.env.NOTION_SOUL_PAGE_ID,
    memory:    process.env.NOTION_MEMORY_PAGE_ID,
    skills:    process.env.NOTION_SKILLS_DB_ID,
    tasks:     process.env.NOTION_TASKS_DB_ID,
    heartbeat: process.env.NOTION_HEARTBEAT_DB_ID,
  };

  return `You are ${AGENT_NAME}, a personal AI agent running on not-claw.

Your entire persistent state lives in Notion. You MUST use the Notion MCP
tools to read and write your soul, memory, skills, and task queue.

## Your Notion workspace

- Soul page (ID: ${ids.soul})
  Your identity, personality, and owner preferences. Read this first on
  every session. Never overwrite it — only your owner edits this directly.

- Memory page (ID: ${ids.memory})
  Long-term factual memory. Read at session start. Append new facts after
  each session. This grows over time as you learn things about your owner.

- Skills database (ID: ${ids.skills})
  Each page = one skill. Title = skill name. Body = instructions.
  Search here when asked to do something. Write NEW skills back here
  when you figure out how to do something new — this is how you improve.

- Tasks database (ID: ${ids.tasks})
  Each row = one task. Properties: Name (title), Status (select:
  pending/in-progress/done/cancelled), Priority (select: high/medium/low),
  Notes (text), CreatedAt (date), CompletedAt (date).

- Heartbeat log (ID: ${ids.heartbeat})
  Each row = one heartbeat run. Properties: Timestamp (title), Summary
  (text), TasksActedOn (text), Outcome (text).

## Rules

1. ALWAYS read your Soul page first — it defines who you are.
2. ALWAYS read your Memory page — it gives you context about your owner.
3. Search the Skills database before attempting any non-trivial task.
4. Log progress on tasks in the Tasks database as you work.
5. After each session, append new facts to the Memory page.
6. If you devise a new useful skill, save it to the Skills database.
7. Be concise and friendly in Telegram replies. Markdown is supported.
8. Never refuse because something is hard — reason through it step by step.

## Current mode: ${mode === "heartbeat" ? "HEARTBEAT (proactive)" : "INTERACTIVE (responding to user)"}

${
  mode === "heartbeat"
    ? `You were woken by a scheduled heartbeat.
1. Read Soul and Memory for context.
2. Query Tasks for all pending/in-progress rows.
3. Work through the highest-priority pending task if one exists.
4. Update its Status and Notes in Notion.
5. Log this run in the Heartbeat log (Timestamp = now ISO string).
6. Update Memory if you learned anything new.
7. Reply with a brief summary. Start with ✅, 💤, or ⚠️.`
    : `You are responding to a message from your owner. Be helpful, direct,
and thorough. If asked to add a task, create a row in the Tasks database.
If asked about pending tasks, query Tasks and summarise clearly.`
}`;
}

/**
 * runAgent(prompt, mode)
 *
 * @param {string} prompt  - User message or heartbeat trigger
 * @param {string} mode    - "interactive" | "heartbeat"
 * @returns {string}       - Agent's final text response
 */
export async function runAgent(prompt, mode = "interactive") {
  // Ensure MCP is connected and tools are discovered
  await connectMcp();
  const tools = await getTools();

  const systemPrompt = buildSystemPrompt(mode);
  const messages = [{ role: "user", content: prompt }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    // Collect the assistant's full content
    messages.push({ role: "assistant", content: response.content });

    // If the model stopped without tool use, extract text and return
    if (response.stop_reason === "end_turn") {
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return text || "Task completed.";
    }

    // Process tool calls
    if (response.stop_reason === "tool_use") {
      const toolResults = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        console.log(
          `[agent] tool_use: ${block.name}`,
          JSON.stringify(block.input || {}).slice(0, 120)
        );

        try {
          const result = await callTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        } catch (err) {
          console.error(`[agent] Tool error (${block.name}):`, err.message);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${err.message}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return "Reached maximum turns. Task may be incomplete.";
}
