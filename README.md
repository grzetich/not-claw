# notion-claw 🦞

> An OpenClaw-inspired personal AI agent powered by the Claude Agent SDK and Notion MCP.

**notion-claw** is a self-hosted personal AI agent that lives in your Telegram and thinks in Notion. It works while you sleep, learns new skills, remembers your preferences, and tackles your task queue on a schedule — all without a proprietary cloud backend.

Inspired by [OpenClaw](https://openclaw.ai), rebuilt with **Notion as the persistent brain** and **Anthropic's Claude Agent SDK** as the reasoning engine.

---

## How it works

```
You (Telegram)
      │
      ▼
 ┌─────────────┐
 │   Gateway   │  ← grammy Telegram bot
 │  gateway.js │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐        ┌─────────────────────┐
 │    Agent    │◄──MCP──►   Notion Workspace  │
 │   agent.js  │        │  • 🧠 Memory page   │
 └─────────────┘        │  • ⚙️ Skills DB     │
        ▲               │  • 📋 Tasks DB      │
        │               │  • 💓 Heartbeat log │
 ┌─────────────┐        └─────────────────────┘
 │  Heartbeat  │  ← node-cron (every 30 min)
 │heartbeat.js │
 └─────────────┘
```

**The agent runtime is the Claude Agent SDK** — the same agentic loop that powers Claude Code. Instead of file system tools, its "computer" is Notion, accessed via the official Notion MCP server.

**Notion is the entire persistent layer:**
- **Memory page** — long-term context the agent reads at the start of every session
- **Skills database** — pages of instructions (like OpenClaw's SKILL.md format), searchable and writable by the agent
- **Tasks database** — the task queue; the agent reads and writes status, notes, and completion timestamps
- **Heartbeat log** — a record of every proactive run

---

## Features

- **Telegram interface** — talk to your agent from anywhere via DM
- **Notion-native memory** — all state in Notion, zero proprietary database
- **Skill system** — the agent can discover skills from Notion and write new ones back
- **Proactive heartbeat** — cron-scheduled wakeups to work through the task queue autonomously
- **Claude Agent SDK** — the full agentic loop with multi-step reasoning and tool use
- **Notion MCP** — official Notion tools via the Model Context Protocol
- **Owner-only access** — your Telegram chat ID is the auth layer
- **Single process** — one `node index.js` runs everything

---

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://platform.claude.com/)
- A Telegram bot token (from [@BotFather](https://t.me/botfather))
- A Notion account (free tier works)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/notion-claw
cd notion-claw
npm install
cp .env.example .env
```

### 2. Set up Notion

Follow [NOTION_SETUP.md](./NOTION_SETUP.md) to create:
- A Notion integration (get your API key)
- Memory page, Skills database, Tasks database, Heartbeat log database
- Share all four with your integration

### 3. Configure `.env`

```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_OWNER_CHAT_ID=...    # Your numeric Telegram ID
NOTION_API_KEY=secret_...
NOTION_MEMORY_PAGE_ID=...
NOTION_SKILLS_DB_ID=...
NOTION_TASKS_DB_ID=...
NOTION_HEARTBEAT_DB_ID=...
HEARTBEAT_CRON=*/30 * * * *
AGENT_NAME=Molty
```

### 4. Run

```bash
npm start                  # Gateway + heartbeat (recommended)
npm run heartbeat          # One-shot heartbeat test
npm run gateway            # Gateway only
npm run dev                # Watch mode for development
```

---

## Usage examples

Once running, message your bot on Telegram:

```
You: Add a task: research noise-cancelling headphones under $200, priority high
Molty: ✅ Added to your task queue with high priority.

You: What tasks are pending?
Molty: 📋 You have 3 pending tasks:
        🔴 research noise-cancelling headphones under $200 (high)
        🟡 write Q1 review draft (medium)
        🟢 update grocery list (low)

You: Learn how to summarise a webpage and save it as a skill
Molty: Got it. I've added a new skill "Summarise webpage" to your Skills database.
       I'll use it next time you ask me to read a URL.

[30 minutes later, heartbeat fires]
Molty: 💓 Heartbeat — researched headphones. Top picks logged in task notes:
       Sony WH-1000XM5, Bose QC45, Anker Q45. Task marked done.
```

---

## Architecture notes

**Why the Claude Agent SDK?**

The Agent SDK runs the full Claude Code agentic loop headlessly: multi-step reasoning, tool calls, self-correction, and result streaming. You don't implement the loop — you wire it to context (Notion) and let it run. For a personal agent that needs to do real work, this is a much better foundation than a raw Messages API call.

**Why Notion MCP?**

Notion MCP exposes Notion's entire API as MCP tools that Claude can call natively. Search databases, read pages, create rows, update blocks — all from within the agent loop with no custom integration code. The agent can also discover new Notion databases it wasn't explicitly told about, which makes the system genuinely extensible.

**Why not OpenClaw's actual stack?**

OpenClaw stores skills and memory as Markdown files on disk. That's great for local-first privacy, but it means you need the machine the files live on. Notion MCP gives you the same structured, searchable, human-readable persistence with the added benefit that you can view and edit your agent's brain from any device.

---

## Project structure

```
notion-claw/
├── index.js          # Entry point, boots gateway + heartbeat
├── gateway.js        # Telegram bot (grammy)
├── agent.js          # Claude Agent SDK wrapper + Notion MCP config
├── heartbeat.js      # Cron scheduler for proactive runs
├── NOTION_SETUP.md   # Step-by-step Notion workspace setup
├── .env.example      # Required environment variables
└── package.json
```

---

## License

MIT
