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
import { getFilteredTools, callTool, connectMcp } from "./mcp-client.js";
import "dotenv/config";

const client = new Anthropic();
const AGENT_NAME = process.env.AGENT_NAME || "Molty";
const MODEL_INTERACTIVE = process.env.MODEL_INTERACTIVE || "claude-sonnet-4-6";
const MODEL_HEARTBEAT = process.env.MODEL_HEARTBEAT || "claude-haiku-4-5-20251001";
const MAX_TURNS = 20;

// Soul page cache (refreshes every hour)
let soulCache = { content: null, fetchedAt: 0 };
const SOUL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch Soul page content, with caching.
 */
async function getSoulContent() {
  const now = Date.now();
  if (soulCache.content && now - soulCache.fetchedAt < SOUL_CACHE_TTL_MS) {
    console.log("[agent] Using cached Soul content");
    return soulCache.content;
  }

  const soulPageId = process.env.NOTION_SOUL_PAGE_ID;
  if (!soulPageId) return null;

  try {
    await connectMcp();
    const result = await callTool("API-get-block-children", {
      block_id: soulPageId,
    });
    soulCache = { content: result, fetchedAt: now };
    console.log("[agent] Fetched and cached Soul content");
    return result;
  } catch (err) {
    console.error("[agent] Error fetching Soul:", err.message);
    return soulCache.content; // Return stale cache on error
  }
}

/**
 * Clear Soul cache (call when you know Soul has changed).
 */
export function clearSoulCache() {
  soulCache = { content: null, fetchedAt: 0 };
}

/**
 * Builds the system prompt for each agent session.
 * @param {string} mode - "interactive" or "heartbeat"
 * @param {string|null} soulContent - Pre-fetched Soul content (saves a tool call)
 */
export function buildSystemPrompt(mode, soulContent = null) {
  const ids = {
    soul:      process.env.NOTION_SOUL_PAGE_ID,
    memory:    process.env.NOTION_MEMORY_PAGE_ID,
    skills:    process.env.NOTION_SKILLS_DB_ID,
    tasks:     process.env.NOTION_TASKS_DB_ID,
    heartbeat: process.env.NOTION_HEARTBEAT_DB_ID,
  };

  const now = new Date();
  const tz = process.env.TIMEZONE || "America/New_York";

  // If Soul content is pre-fetched, inject it to save a tool call
  const soulSection = soulContent
    ? `\n\n## Your Soul (pre-loaded, no need to fetch)\n\n${soulContent}`
    : "";

  return `You are ${AGENT_NAME}, a personal AI agent running on not-claw.

Current time: ${now.toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "long" })}
Timezone: ${tz}

IMPORTANT: Use this timestamp as your source of truth for the current date
and time. Do NOT guess or estimate. When calculating how long until a due
date, use this exact time.

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

## Tool usage notes

### Notion tools
- Do NOT use API-query-data-source — it targets a newer Notion API endpoint
  that returns errors. Instead, use API-post-search to find database rows
  and API-retrieve-a-database to inspect database schemas.
- To create a page or database row, use API-post-page. IMPORTANT: the
  "parent" parameter must be a JSON object, NOT a string. Correct example:
  { "parent": {"database_id": "abc123"}, "properties": {...} }
- To read a page's body content (blocks), use API-get-block-children.
- To write or append body content to a page, use API-patch-block-children.

### Fetch tool
- Use the "fetch" tool to retrieve content from any URL on the web.
- Useful for reading web pages, APIs, documentation, or any public URL.
- Returns the page content as markdown by default.

### Brave Search tool (if available)
- Use "brave_web_search" to search the web for current information.
- Use "brave_local_search" for location-based queries (businesses, places).
- Prefer Brave Search when the user asks a question that requires up-to-date
  information beyond what you already know.

${soulSection}

## Rules

1. If Soul is pre-loaded above, skip reading it. Otherwise read Soul first.
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
1. Read Memory for context (Soul is pre-loaded above).
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
  const model = mode === "heartbeat" ? MODEL_HEARTBEAT : MODEL_INTERACTIVE;
  console.log(`[agent] Using model: ${model}`);

  // Ensure MCP is connected and tools are discovered
  await connectMcp();
  const tools = await getFilteredTools();

  // Pre-fetch Soul content (cached, saves a tool call)
  const soulContent = await getSoulContent();

  const systemPrompt = buildSystemPrompt(mode, soulContent);
  const messages = [{ role: "user", content: prompt }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
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
