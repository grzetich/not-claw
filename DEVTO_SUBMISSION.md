---
title: "not-claw: A Personal AI Agent That Lives in Telegram and Thinks in Notion"
published: false
tags: devchallenge, notionchallenge, mcp, ai
---

*This is a submission for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04)*

---

## What I Built

**not-claw** is a self-hosted personal AI agent that talks to you over Telegram and thinks in Notion.

It's directly inspired by [OpenClaw](https://openclaw.ai) — the open-source personal agent that went viral in early 2026. OpenClaw stores its memory, skills, and task queue as Markdown files on disk. not-claw replaces that flat-file layer with **Notion as the persistent brain**, accessed entirely through the **Notion MCP server**.

The result is an agent that:

- **Responds to your Telegram messages** as a personal assistant
- **Works proactively on a heartbeat schedule** (every 30 minutes by default) to complete tasks while you're away
- **Remembers things across sessions** via a Notion Memory page it reads and writes
- **Learns new skills** by writing instruction pages to a Notion Skills database
- **Manages a task queue** in a Notion Tasks database, picking up work autonomously
- **Has a soul** — a stable identity page in Notion that defines its personality and knows about you

The entire agent state is visible and editable in Notion. You can open your Skills database on your phone, edit an instruction, and the next agent session will use the updated version. Nothing is locked in a proprietary format.

---

## Video Demo

<!-- TODO: record 2-3 minute demo showing:
1. Sending a message in Telegram ("add a task")
2. Task appearing in Notion Tasks database
3. Triggering a heartbeat manually (npm run heartbeat)
4. Agent working through the task, updating Notion
5. Telegram notification arriving with the result
6. Quick tour of the Notion workspace: Soul, Memory, Skills, Tasks, Heartbeat log
-->

---

## Show us the code

[github.com/grzetich/not-claw](https://github.com/grzetich/not-claw)

The core architecture:

| File | Role |
|------|------|
| `agent.js` | Anthropic SDK agentic loop — Claude reasons and calls Notion MCP tools |
| `mcp-client.js` | MCP client — spawns the Notion MCP server via stdio, discovers tools, bridges calls |
| `gateway.js` | Telegram bot (grammy) — the front door |
| `heartbeat.js` | Cron scheduler for proactive runs |
| `index.js` | Entry point, boots everything |

---

## How I Used Notion MCP

Notion MCP is the load-bearing piece of this whole system. The agent has no hardcoded Notion API calls — every interaction with Notion goes through MCP tool calls that Claude discovers and invokes autonomously.

### The MCP integration

At startup, `mcp-client.js` spawns the official `@notionhq/notion-mcp-server` as a stdio subprocess and connects via the MCP SDK:

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
```

This discovers **22 Notion MCP tools** at startup — everything from `API-post-search` to `API-patch-page` to `API-query-data-source`. These are converted to Anthropic tool-use format and passed directly to Claude.

### Notion as the agent's file system

OpenClaw uses `~/.openclaw/` — a directory of Markdown and YAML files — as its persistent state. not-claw replaces all of that with Notion:

| OpenClaw concept | not-claw equivalent |
|-----------------|----------------------|
| `SOUL.md` | Notion Soul page |
| `MEMORY.md` | Notion Memory page |
| `skills/` directory | Notion Skills database |
| Task queue | Notion Tasks database |
| Heartbeat log | Notion Heartbeat log database |

The agent reads its Soul and Memory pages at the start of every session. It queries the Skills database to find relevant instructions. It creates and updates rows in the Tasks database to track work. It logs every heartbeat run.

### The agent can extend itself

Because Notion MCP gives the agent full read/write access, it can write new skill pages back to the Skills database during a session. Tell it "learn how to summarise a webpage and save it as a skill" — it figures out the process, writes a new page to the Skills database, and that skill is available on every future run. This is the OpenClaw self-improving pattern, rebuilt on Notion.

### Human-readable state, editable from anywhere

Everything the agent knows is in Notion. You can open your Skills database on your phone, edit an instruction, and the next agent session will use the updated version. You don't need to SSH into a machine to change the agent's behavior. You just edit a Notion page.

### Heartbeat: proactive work without being asked

The heartbeat is what makes this feel like OpenClaw rather than a chatbot. Every 30 minutes (configurable), a cron job fires and runs the agent in "heartbeat mode". The system prompt tells the agent to check the task queue, pick up the highest-priority pending task, work on it, update Notion, and message you with the result.

You didn't ask it to do anything. It just did it. And you can see exactly what happened in the Heartbeat log database in Notion.

---

## Technical background

The system uses four key technologies:

- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude's Messages API with tool-use for the agentic loop. Claude reasons, calls MCP tools, observes results, and continues until the task is done.
- **Notion MCP Server** (`@notionhq/notion-mcp-server`) — The official Notion MCP server, spawned as a stdio subprocess. Exposes 22 Notion API tools that Claude discovers and calls autonomously.
- **MCP SDK** (`@modelcontextprotocol/sdk`) — The MCP client that connects to the Notion MCP server, handles tool discovery, and bridges tool calls.
- **grammy** — Telegram bot framework for the user interface.

The agentic loop in `agent.js` is straightforward: send messages to Claude with the discovered MCP tools, execute any tool calls Claude makes via the MCP client, feed results back, and repeat until Claude returns a final text response. No custom Notion API code — just MCP.

---

## Running it yourself

```bash
git clone https://github.com/grzetich/not-claw
cd not-claw
npm install
# Create .env with your credentials (see NOTION_SETUP.md)
npm start
```

Full setup instructions: [NOTION_SETUP.md](https://github.com/grzetich/not-claw/blob/main/NOTION_SETUP.md)

Required: Anthropic API key, Telegram bot token, Notion integration token.

---

*Built for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04). MIT license.*
