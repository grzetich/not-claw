---
title: notion-claw: An OpenClaw-Inspired Personal AI Agent Powered by Notion MCP
published: false
tags: devchallenge, notionchallenge, mcp, ai
---

*This is a submission for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04)*

---

## What I Built

**notion-claw** is a self-hosted personal AI agent that talks to you over Telegram and thinks in Notion.

It's directly inspired by [OpenClaw](https://openclaw.ai) — the open-source personal agent that went viral in early 2026. OpenClaw stores its memory, skills, and task queue as Markdown files on disk. notion-claw replaces that flat-file layer with **Notion as the persistent brain**, accessed via the official Notion MCP server.

The result is an agent that:

- **Responds to your Telegram messages** as a personal assistant
- **Works proactively on a heartbeat schedule** (every 30 minutes by default) to complete tasks while you're away
- **Remembers things across sessions** via a Notion Memory page it reads and writes
- **Learns new skills** by writing instruction pages to a Notion Skills database
- **Manages a task queue** in a Notion Tasks database, picking up work autonomously

The entire agent state is visible and editable in Notion. You can open your Skills database and write new instructions for the agent directly. You can see exactly what it did on each heartbeat run in the Heartbeat log. Nothing is locked in a proprietary format.

---

## Video Demo

<!-- TODO: record 2-3 minute demo showing:
1. Sending a message in Telegram ("add a task")
2. Task appearing in Notion Tasks database
3. Triggering a heartbeat manually (node index.js --heartbeat)
4. Agent working through the task, updating Notion
5. Telegram notification arriving with the result
6. Quick tour of the Notion workspace: Memory, Skills, Tasks, Heartbeat log
-->

---

## Show us the code

[github.com/your-username/notion-claw](https://github.com/your-username/notion-claw)

The core is four files:

| File | Role |
|------|------|
| `gateway.js` | Telegram bot (grammy) — the front door |
| `agent.js` | Claude Agent SDK wrapper + Notion MCP config |
| `heartbeat.js` | Cron scheduler for proactive runs |
| `index.js` | Entry point, boots everything |

---

## How I Used Notion MCP

Notion MCP is the load-bearing piece of this whole system. Here's specifically what it unlocks:

### Notion as the agent's file system

OpenClaw uses `~/.openclaw/` — a directory of Markdown and YAML files — as its persistent state. Skill instructions live in `SKILL.md` files. Memory lives in `SOUL.md` and `MEMORY.md`. The heartbeat checklist lives in `HEARTBEAT.md`.

notion-claw replaces all of that with Notion:

| OpenClaw concept | notion-claw equivalent |
|-----------------|----------------------|
| `SOUL.md` / `MEMORY.md` | Notion Memory page |
| `skills/` directory | Notion Skills database |
| Task queue | Notion Tasks database |
| Heartbeat log | Notion Heartbeat log database |

The agent reads its Memory page at the start of every session. It queries the Skills database to find relevant instructions when the user asks for something. It creates and updates rows in the Tasks database to track work. It logs every heartbeat run.

### The agent can extend itself

Because Notion MCP gives the agent full read/write access, it can write new skill pages back to the Skills database during a session. Tell it "learn how to summarise a webpage and save it as a skill" — it figures out the process, writes a new page to the Skills database, and that skill is available on every future run. This is the OpenClaw self-improving pattern, rebuilt on Notion.

### Human-readable state, editable from anywhere

Everything the agent knows is in Notion. You can open your Skills database on your phone, edit an instruction, and the next agent session will use the updated version. You don't need to SSH into a machine to change the agent's behavior. You don't need to know YAML. You just edit a Notion page.

### The Notion MCP integration in code

The Notion MCP server is wired into the Claude Agent SDK in `agent.js`:

```javascript
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

for await (const message of query({
  prompt,
  systemPrompt,
  options: {
    mcpServers: [NOTION_MCP_SERVER],
    allowedTools: ["mcp__notion__*"],
    maxTurns: 20,
  },
})) {
  if (message.type === "result") {
    finalResult = message.result;
  }
}
```

The Claude Agent SDK handles tool discovery, tool calls, and the full agentic loop. Notion MCP handles the Notion API. My code is just the plumbing that connects them.

### Heartbeat: proactive work without being asked

The heartbeat is what makes this feel like OpenClaw rather than a chatbot. Every 30 minutes (configurable), a cron job fires and runs the agent in "heartbeat mode". The system prompt changes to tell the agent it's been woken up to check the task queue:

```
HEARTBEAT TRIGGER - 2026-03-04T14:30:00Z

1. Read your Memory page for context.
2. Query the Tasks database for all pending tasks.
3. Pick the highest-priority pending task and work on it.
4. Update its Status and Notes in Notion.
5. Log this run in the Heartbeat log.
6. Return a brief summary.
```

The agent queries Notion, finds a pending task, does the work (research, drafting, whatever the task is), updates the Notion row, logs the run, and sends you a Telegram message with the result. You didn't ask it to do anything. It just did it.

---

## Technical background

I'm a senior technical writer and independent researcher who's been building MCP servers since before OpenClaw existed. My current project, [Tokens Not Jokin'](https://tokensnotjokin.com), is a deep-dive into how API documentation format affects AI code generation quality across 21,000+ integration tests.

The MCP pattern — connecting AI models to external state via a structured protocol — is the core thesis of both that research and this project. Notion MCP is a particularly clean example of the pattern because Notion is itself a flexible, structured data layer that happens to be human-readable and editable.

The Claude Agent SDK (formerly Claude Code SDK) was renamed during development of this project. It's the same agentic harness that powers Claude Code, now available as a library. Running it headlessly as a personal agent runtime is exactly the use case the Anthropic team described when they launched the Agent SDK blog post.

---

## Running it yourself

```bash
git clone https://github.com/your-username/notion-claw
cd notion-claw
npm install
cp .env.example .env
# Fill in .env (see NOTION_SETUP.md for the Notion side)
npm start
```

Full setup instructions: [NOTION_SETUP.md](https://github.com/your-username/notion-claw/blob/main/NOTION_SETUP.md)

Required: Anthropic API key, Telegram bot token, Notion integration token.

---

*Built for the [Notion MCP Challenge](https://dev.to/challenges/notion-2026-03-04). MIT license.*
