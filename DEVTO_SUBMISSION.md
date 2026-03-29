---
title: "not-claw: A Personal AI Agent That Lives in Telegram and Thinks in Notion"
published: false
tags: devchallenge, notionchallenge, mcp, ai
---

*This is a submission for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04)*

## What I Built

**not-claw** is a self-hosted personal AI agent that talks to you on Telegram and uses Notion as its entire brain — memory, skills, tasks, and identity — accessed through the Notion MCP server.

Inspired by [OpenClaw](https://openclaw.ai), the open-source personal agent framework that stores state as Markdown files on disk, not-claw replaces that flat-file layer with Notion. The agent reads a Soul page to know who it is. It reads a Memory page to remember what it's learned. It queries a Skills database for instructions on how to do things. It manages a Tasks database as its work queue. And every 30 minutes, a heartbeat wakes it up to work through pending tasks without being asked.

The entire agent state is visible and editable in Notion. You can open the Skills database on your phone, write a new instruction, and the next time the agent runs it'll use it. You can see exactly what happened on every heartbeat in the log. Nothing is locked in a proprietary format — it's just Notion pages.

The agent also knows your timezone (configured via `TIMEZONE` in `.env`) — every prompt includes the exact local time so it does correct time math for due dates.

The stack: Anthropic SDK for reasoning (Sonnet for interactive chat, Haiku for heartbeats — both configurable via `MODEL_INTERACTIVE` and `MODEL_HEARTBEAT` in `.env`), `@notionhq/notion-mcp-server` for Notion access via MCP, `@modelcontextprotocol/sdk` for the MCP client, and grammy for the Telegram bot.

## Video Demo

<!-- REPLACE with embedded video link after recording -->

## Show us the code

{% github grzetich/not-claw %}

**Core files:**

| File | What it does |
|------|-------------|
| `mcp-client.js` | Spawns the Notion MCP server as a stdio subprocess, discovers 22 tools at startup, bridges tool calls between Claude and Notion |
| `agent.js` | Agentic loop — sends messages to Claude with MCP tools, executes tool calls, feeds results back, repeats until done |
| `gateway.js` | Telegram bot (grammy) — relays messages between you and the agent, owner-only auth |
| `heartbeat.js` | Cron job that wakes the agent every 30 minutes to work the task queue |
| `index.js` | Entry point — boots gateway and heartbeat together |

## How I Used Notion MCP

Notion MCP is the foundation of the entire system. The agent has zero hardcoded Notion API calls — every read, write, search, and update goes through MCP tool calls that Claude discovers and invokes on its own.

### Connecting to Notion MCP

At startup, `mcp-client.js` spawns the official `@notionhq/notion-mcp-server` as a stdio subprocess:

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@notionhq/notion-mcp-server"],
  env: {
    ...process.env,
    OPENAPI_MCP_HEADERS: JSON.stringify({
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
    }),
  },
});

const client = new Client({ name: "not-claw", version: "1.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
// → 22 tools: API-post-search, API-get-block-children,
//   API-patch-page, API-query-data-source, etc.
```

These 22 tools are converted to Anthropic tool-use format and passed to Claude. Claude decides which tools to call, in what order, with what arguments. The MCP client executes them and returns results. The agent code is just the loop — Notion MCP does the heavy lifting.

### What Notion MCP unlocks

**Notion as the agent's operating system.** OpenClaw uses a directory of Markdown files (`SOUL.md`, `MEMORY.md`, `skills/*.md`). not-claw replaces all of it with Notion pages and databases:

| OpenClaw | not-claw (via Notion MCP) |
|----------|--------------------------|
| `SOUL.md` | Soul page — agent identity, personality, owner context |
| `MEMORY.md` | Memory page — long-term facts, appended each session |
| `skills/` directory | Skills database — each page = one skill with instructions |
| Task queue | Tasks database — status, priority, notes, timestamps |
| Heartbeat log | Heartbeat database — record of every proactive run |

**Self-improving agent.** Because Notion MCP gives full read/write access, the agent can write new skill pages back to the Skills database. Tell it "figure out how to summarize a webpage and save it as a skill" — it writes the instructions to Notion, and every future session can use that skill. This is the OpenClaw self-improvement loop, rebuilt on Notion.

**Proactive work via heartbeat.** Every 30 minutes, a cron job fires and runs the agent using Haiku (~60x cheaper than Sonnet) to check for pending tasks, pick up the highest-priority one, do the work, update the task status, log the run to the Heartbeat database, and message you the result on Telegram. Interactive messages still use Sonnet for quality. You didn't ask it to do anything — it just checked Notion and got to work.

**Two-way collaboration, not just a chatbot.** Because the brain is in Notion, you and the agent are equal participants in the same workspace. Tell the bot to add a task via Telegram, then open Notion later to add details, reprioritize, or mark it done yourself. Write a skill page directly in Notion and the agent uses it next session. Edit the Memory page to correct something the agent got wrong. Add tasks straight to the database and the heartbeat finds them. The data isn't locked behind the bot — Notion is the shared workspace, and you and the agent both read and write to it.

### The agentic loop

The loop in `agent.js` is simple because MCP handles the complexity:

1. Connect to Notion MCP, discover tools
2. Send user message + tools to Claude
3. If Claude calls tools → execute via MCP client, feed results back, repeat
4. If Claude returns text → send to user via Telegram

Claude typically makes 3-8 tool calls per interaction: read Soul, read Memory, search Skills, then do whatever the user asked (create a task, query the database, update a page, etc.).

---

```bash
git clone https://github.com/grzetich/not-claw
cd not-claw
npm install
# See NOTION_SETUP.md for workspace configuration
# Set TIMEZONE in .env to your IANA timezone (e.g. America/New_York)
npm start
```

*MIT license.*
