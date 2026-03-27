/**
 * agent.js
 *
 * The brain. Wraps the Claude Agent SDK and wires in Notion MCP as the
 * persistent context layer. Each call to runAgent() spins up a full
 * agentic loop: Claude reasons, calls Notion MCP tools, and returns a
 * final text response.
 *
 * Notion workspace layout:
 *   Soul page    — who the agent is, persona, owner preferences (stable)
 *   Memory page  — what the agent knows and has learned (grows over time)
 *   Skills DB    — pages of instructions, searchable and writable by agent
 *   Tasks DB     — task queue with status, priority, notes
 *   Heartbeat log — record of every proactive run
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import "dotenv/config";

const AGENT_NAME = process.env.AGENT_NAME || "Alfred";

// Notion MCP server — gives Claude the full Notion tool suite via MCP
const NOTION_MCP_SERVER = {
  type: "url",
  url: "https://mcp.notion.com/mcp",
  name: "notion",
  transportOptions: {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    },
  },
};

/**
 * Builds the system prompt for each agent session.
 * Soul = identity (read once, stable)
 * Memory = accumulated knowledge (read and written each session)
 */
function buildSystemPrompt(mode) {
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
export { buildSystemPrompt };

export async function runAgent(prompt, mode = "interactive") {
  const systemPrompt = buildSystemPrompt(mode);
  let finalResult = "";

  try {
    for await (const message of query({
      prompt,
      systemPrompt,
      options: {
        mcpServers: [NOTION_MCP_SERVER],
        allowedTools: ["mcp__notion__*"],
        maxTurns: 20,
        model: "claude-sonnet-4-6",
      },
    })) {
      if (message.type === "result") {
        finalResult = message.result || "";
      }
      // Log tool calls for debugging
      if (message.type === "assistant") {
        for (const block of message.message?.content || []) {
          if (block.type === "tool_use") {
            console.log(
              `[agent] tool_use: ${block.name}`,
              JSON.stringify(block.input || {}).slice(0, 120)
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("[agent] Error:", err.message);
    throw err;
  }

  return finalResult || "Task completed.";
}
