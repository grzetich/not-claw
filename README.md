# not-claw

> An OpenClaw-inspired personal AI agent powered by the Anthropic SDK and Notion MCP.

**not-claw** is a self-hosted personal AI agent that lives in your Telegram and thinks in Notion. It works while you sleep, learns new skills, remembers your preferences, and tackles your task queue on a schedule — all without a proprietary cloud backend.

Inspired by [OpenClaw](https://openclaw.ai), rebuilt with **Notion as the persistent brain** and **Anthropic's SDK** as the reasoning engine, connected via the **Notion MCP server**.

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
 ┌─────────────┐    MCP (stdio)    ┌─────────────────────┐
 │    Agent    │◄─────────────────►│  Notion MCP Server  │
 │   agent.js  │                   │  (@notionhq/        │
 │             │                   │   notion-mcp-server) │
 └─────────────┘                   └────────┬────────────┘
        ▲                                   │
        │                                   ▼
 ┌─────────────┐                   ┌─────────────────────┐
 │  Heartbeat  │  ← node-cron     │   Notion Workspace  │
 │heartbeat.js │    (every 30 min) │  • 🧠 Soul page     │
 └─────────────┘                   │  • 🧠 Memory page   │
                                   │  • ⚙️ Skills DB     │
                                   │  • 📋 Tasks DB      │
                                   │  • 💓 Heartbeat log │
                                   └─────────────────────┘
```

**The agent runtime is the Anthropic SDK** — Claude reasons over messages, discovers Notion MCP tools, and calls them in an agentic loop. The MCP client (`mcp-client.js`) spawns the official `@notionhq/notion-mcp-server` as a stdio subprocess and bridges tool calls between Claude and Notion.

**Notion is the entire persistent layer:**
- **Soul page** — who the agent is, personality, owner preferences (stable, owner-edited)
- **Memory page** — long-term context the agent reads and writes each session
- **Skills database** — pages of instructions, searchable and writable by the agent
- **Tasks database** — the task queue; the agent reads and writes status, notes, and completion timestamps
- **Heartbeat log** — a record of every proactive run

---

## Features

- **Telegram interface** — talk to your agent from anywhere via DM
- **Notion MCP** — official Notion MCP server for full read/write access to your workspace
- **Notion-native memory** — all state in Notion, zero proprietary database
- **Skill system** — the agent can discover skills from Notion and write new ones back
- **Proactive heartbeat** — cron-scheduled wakeups to work through the task queue autonomously
- **Anthropic SDK** — direct API tool-use loop with Claude
- **Owner-only access** — your Telegram chat ID is the auth layer
- **Single process** — one `node index.js` runs everything

---

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- A Telegram bot token (from [@BotFather](https://t.me/botfather))
- A Notion account with an internal integration

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/grzetich/not-claw
cd not-claw
npm install
```

### 2. Set up Notion

Follow [NOTION_SETUP.md](./NOTION_SETUP.md) to create:
- A Notion integration (get your API key)
- Soul page, Memory page, Skills database, Tasks database, Heartbeat log database
- Share all five with your integration

### 3. Configure `.env`

```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_OWNER_CHAT_ID=...
NOTION_API_KEY=ntn_...
NOTION_SOUL_PAGE_ID=...
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
npm test                   # Run tests
```

---

## Usage examples

Once running, message your bot on Telegram:

```
You: Add a task: research noise-cancelling headphones under $200, priority high
Molty: Added to your task queue with high priority.

You: What tasks are pending?
Molty: You have 3 pending tasks:
        research noise-cancelling headphones under $200 (high)
        write Q1 review draft (medium)
        update grocery list (low)

You: Learn how to summarise a webpage and save it as a skill
Molty: Got it. I've added a new skill "Summarise webpage" to your Skills database.
       I'll use it next time you ask me to read a URL.

[30 minutes later, heartbeat fires]
Molty: Heartbeat — researched headphones. Top picks logged in task notes:
       Sony WH-1000XM5, Bose QC45, Anker Q45. Task marked done.
```

---

## Architecture notes

**Why the Anthropic SDK with Notion MCP?**

The Anthropic SDK's Messages API with tool-use gives us a clean agentic loop: Claude reasons, calls tools, observes results, and continues. The MCP client discovers all 22 Notion tools at startup and bridges them into Claude's tool-use format. Claude can search, read, create, and update anything in your Notion workspace.

**Why Notion MCP?**

The official `@notionhq/notion-mcp-server` exposes Notion's entire API as MCP tools that Claude can call natively. Search databases, read pages, create rows, update blocks — all from within the agent loop with no custom integration code. The agent can also discover new Notion databases it wasn't explicitly told about, which makes the system genuinely extensible.

**Why not OpenClaw's actual stack?**

OpenClaw stores skills and memory as Markdown files on disk. That's great for local-first privacy, but it means you need the machine the files live on. Notion MCP gives you the same structured, searchable, human-readable persistence with the added benefit that you can view and edit your agent's brain from any device.

---

## Project structure

```
not-claw/
├── index.js          # Entry point, boots gateway + heartbeat
├── gateway.js        # Telegram bot (grammy)
├── agent.js          # Anthropic SDK agentic loop + Notion MCP tools
├── mcp-client.js     # MCP client — connects to Notion MCP server via stdio
├── notion.js         # Notion REST API wrapper (alternative to MCP)
├── heartbeat.js      # Cron scheduler for proactive runs
├── oauth.js          # One-time OAuth flow for Notion public integrations
├── agent.test.js     # Unit tests
├── icon.svg          # App icon
├── NOTION_SETUP.md   # Step-by-step Notion workspace setup
└── package.json
```

---

## License

MIT
