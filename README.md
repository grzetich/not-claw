# not-claw

A personal AI agent that lives in Telegram and thinks in Notion.

Inspired by [OpenClaw](https://openclaw.ai) — but instead of Markdown files on disk, the agent's entire brain is a Notion workspace accessed through the [Notion MCP server](https://github.com/notionhq/notion-mcp-server). Soul, memory, skills, tasks, and heartbeat logs are all Notion pages and databases that both you and the agent read and write to.

---

## How it works

```
You (Telegram)
      |
      v
 +-----------+     MCP (stdio)     +---------------------+
 |  Gateway   | ----------------->  |  Notion MCP Server  |
 | gateway.js |     Agent loop      | @notionhq/          |
 +-----------+  <-  agent.js  ->    |  notion-mcp-server   |
      ^                             +---------+-----------+
      |                                       |
 +-----------+                                v
 | Heartbeat |  <- node-cron         Notion Workspace
 |heartbeat.js|   (every 30 min)     - Soul page
 +-----------+                       - Memory page
                                     - Skills DB
                                     - Tasks DB
                                     - Heartbeat log
```

1. You message the bot on Telegram
2. The gateway passes your message to the agent loop (`agent.js`)
3. Claude reads your Soul and Memory pages, searches Skills, then does whatever you asked — all through Notion MCP tool calls
4. Every 30 minutes, the heartbeat wakes the agent to work through pending tasks on its own

**Everything goes through Notion MCP.** The agent has zero hardcoded Notion API calls. Claude discovers 22 MCP tools at startup and decides which to call, in what order, with what arguments.

---

## Features

- **Notion as the brain** — Soul, Memory, Skills, Tasks, and Heartbeat log are all Notion pages/databases. Visible, editable, portable.
- **Proactive heartbeat** — every 30 minutes, the agent wakes up and works the task queue without being asked. Uses Haiku for cost efficiency.
- **Self-improving skills** — tell the agent to learn something and it writes a new skill page to Notion. Future sessions use it automatically.
- **Two-way collaboration** — add tasks in Notion directly and the heartbeat picks them up. Edit the Memory page to correct the agent. You and the bot share the same workspace.
- **Configurable models** — Sonnet for interactive chat, Haiku for heartbeats, both swappable via env vars.
- **Cost-optimized** — heartbeat skips Claude API calls when no tasks are pending, Soul page is cached, and only 8 of 22 MCP tools are sent to reduce input tokens.
- **Owner-only** — locked to your Telegram chat ID.
- **Google tools (optional)** — search/read Google Docs, search/read/send Gmail. Opt-in via OAuth.

---

## Quick start

```bash
git clone https://github.com/grzetich/not-claw
cd not-claw
npm install
```

Follow [NOTION_SETUP.md](./NOTION_SETUP.md) to create your Notion workspace (Soul page, Memory page, Skills DB, Tasks DB, Heartbeat log). Share all five with your integration.

Create a `.env`:

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
TIMEZONE=America/New_York
MODEL_INTERACTIVE=claude-sonnet-4-6
MODEL_HEARTBEAT=claude-haiku-4-5-20251001
```

Set `TIMEZONE` to your [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) — the agent gets your exact local time in every prompt.

```bash
npm start                  # Gateway + heartbeat
npm run heartbeat          # One-shot heartbeat test
npm run gateway            # Gateway only (no heartbeat)
npm test                   # Run tests
```

---

## Google tools (optional)

Enable Google Docs and Gmail tools so the agent can search and read your Docs, search/read your email, and send replies on your behalf.

**1. Create a Google Cloud project and OAuth credentials:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
2. Enable three APIs: **Google Docs API**, **Google Drive API**, **Gmail API**.
3. Create an OAuth 2.0 client (type: Web application).
4. Add `http://localhost:3334/callback` as an authorized redirect URI.
5. Copy the client ID and client secret into `.env`:

```env
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

**2. Run the one-time OAuth flow to get a refresh token:**

```bash
node google-oauth.js
```

This opens your browser, asks you to grant access, then prints a `GOOGLE_REFRESH_TOKEN`. Add it to `.env`:

```env
GOOGLE_REFRESH_TOKEN=1//...
```

**3. Done.** On next startup, the agent will have these tools available:

| Tool | What it does |
|---|---|
| `google_docs_search` | Find Google Docs by name or full-text content |
| `google_docs_read` | Read the full text of a Google Doc by ID |
| `gmail_search` | Search email using Gmail query syntax (`from:`, `is:unread`, `newer_than:`) |
| `gmail_read` | Read a full email message by ID |
| `gmail_send` | Send a new email or reply to an existing thread |

Granted scopes are `documents.readonly`, `drive.readonly`, `gmail.readonly`, and `gmail.send`. Docs and Drive are read-only; Gmail can read and send. The agent is instructed to confirm with you before sending email.

Leave the `GOOGLE_*` vars out of `.env` and these tools simply aren't registered.

---

## Example conversation

```
You:   Add a task: research noise-cancelling headphones under $200, priority high
Molty: Added to your task queue with high priority.

You:   What tasks are pending?
Molty: You have 3 pending tasks:
         research noise-cancelling headphones under $200 (high)
         write Q1 review draft (medium)
         update grocery list (low)

You:   Learn how to summarise a webpage and save it as a skill
Molty: Done — I've added "Summarise webpage" to your Skills database.

[30 minutes later, heartbeat fires]
Molty: Heartbeat — researched headphones. Top picks: Sony WH-1000XM5,
       Bose QC45, Anker Q45. Notes added, task marked done.
```

---

## Project structure

```
not-claw/
├── index.js          Entry point — boots gateway + heartbeat
├── gateway.js        Telegram bot (grammy), owner-only auth
├── agent.js          Agentic loop — Anthropic SDK + Notion MCP tools
├── mcp-client.js     MCP client — spawns Notion MCP server via stdio
├── google-client.js  Authenticated Google API clients (lazy-loaded)
├── google-tools.js   Google Docs and Gmail tool handlers
├── google-oauth.js   One-time OAuth flow to get a Google refresh token
├── heartbeat.js      Cron scheduler for proactive runs
├── agent.test.js     Tests (vitest)
├── oauth.js          One-time OAuth flow for Notion public integrations
├── NOTION_SETUP.md   Step-by-step Notion workspace setup
└── package.json
```

---

## How Notion MCP is used

The official `@notionhq/notion-mcp-server` is spawned as a stdio subprocess at startup. The MCP client discovers all available tools and converts them to Anthropic tool-use format. Claude decides which tools to call during each conversation.

| Notion concept | What the agent does with it |
|---|---|
| **Soul page** | Pre-fetched and cached (1-hour TTL), injected into system prompt |
| **Memory page** | Reads for context, appends new facts after each session |
| **Skills DB** | Searches before non-trivial tasks, writes new skills when it learns |
| **Tasks DB** | Creates, queries, and updates tasks as its work queue |
| **Heartbeat log** | Logs every proactive run with timestamp, summary, and outcome |

The agent typically makes 3-8 MCP tool calls per interaction. The code is just the loop — Notion MCP does the heavy lifting.

**Cost optimizations:**
- Heartbeat pre-check queries Tasks DB via MCP directly — if no pending tasks, skips Claude entirely (zero API cost)
- Soul page cached in memory for 1 hour, pre-injected into system prompt (saves 1 tool call per run)
- Tool definitions filtered from 22 to 8 (saves ~1000 input tokens per API call)

**Note:** The MCP server exposes an `API-query-data-source` tool that targets Notion's newer `/v1/data_sources/` endpoint, which doesn't work with internal integrations. The system prompt steers Claude toward `API-post-search` and `API-retrieve-a-database` instead, which work reliably.

---

## License

MIT
