# Notion Workspace Setup

Follow these steps once before running not-claw. This creates the databases
and pages that act as the agent's persistent brain.

---

## 1. Create a Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **+ New integration**
3. Name it `not-claw`
4. Set capabilities: **Read content**, **Update content**, **Insert content**
5. Copy the **Internal Integration Token** (starts with `ntn_`)
6. Add it to your `.env` as `NOTION_API_KEY`

---

## 2. Create the Workspace Structure

Create a top-level Notion page called **not-claw** (or any name you like).
This will be the root. Then create the following inside it:

---

### Soul Page

Create a plain **page** (not a database) called `🧠 Soul`.

This defines who your agent is. Write something like:

```
I am Molty, a personal AI agent built on not-claw.

## Personality
- Friendly, concise, and proactive
- I use markdown in Telegram messages
- I prefer to do things rather than ask for permission

## About my owner
- [Add details about yourself here]
- [Preferences, work context, etc.]
```

Copy the page ID from the URL and add it to `.env` as `NOTION_SOUL_PAGE_ID`.
Share this page with your integration: open the page, click `...` → **Connections** → add `not-claw`.

---

### Memory Page

Create a plain **page** (not a database) called `🧠 Memory`.

Write an initial note like:

```
This page is my long-term memory. I update it after each session
with facts worth keeping.

## About my owner
[leave blank for now - I'll fill this in as I learn]

## Running notes
[I'll add to this over time]
```

Copy the page ID and add it to `.env` as `NOTION_MEMORY_PAGE_ID`.
Share this page with your integration.

---

### Skills Database

Create a **database** (full-page) called `⚙️ Skills`.

Set these properties:
| Property | Type | Notes |
|----------|------|-------|
| Name | Title | Skill name (default) |
| Tags | Multi-select | e.g. productivity, research, writing |
| CreatedAt | Date | When the skill was added |

Each page in this database = one skill. The page body contains the
instructions the agent follows when using that skill.

**Create a starter skill page** called `Add a task` with this body:

```
To add a task to the task queue, create a new row in the Tasks database
with the following properties:
- Name: the task description
- Status: pending
- Priority: as specified by the user (default: medium)
- Notes: any additional context
- CreatedAt: today's date
```

Copy the database ID from the URL and add it to `.env` as `NOTION_SKILLS_DB_ID`.
Share the database with the integration.

---

### Tasks Database

Create a **database** called `📋 Tasks`.

Set these properties:
| Property | Type | Notes |
|----------|------|-------|
| Name | Title | Task description (default) |
| Status | Select | Options: `pending`, `in-progress`, `done`, `cancelled` |
| Priority | Select | Options: `high`, `medium`, `low` |
| Notes | Text | Agent progress notes |
| CreatedAt | Date | |
| CompletedAt | Date | Set when status → done |

Copy the database ID and add it to `.env` as `NOTION_TASKS_DB_ID`.
Share with the integration.

---

### Heartbeat Log Database

Create a **database** called `💓 Heartbeat Log`.

Set these properties:
| Property | Type | Notes |
|----------|------|-------|
| Timestamp | Title | ISO timestamp of the run |
| Summary | Text | What the agent found |
| TasksActedOn | Text | Which tasks were touched |
| Outcome | Text | Result of the run |

Copy the database ID and add it to `.env` as `NOTION_HEARTBEAT_DB_ID`.
Share with the integration.

---

## 3. Configure Your .env

```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=your_token_from_botfather
TELEGRAM_OWNER_CHAT_ID=your_numeric_chat_id
NOTION_API_KEY=ntn_...
NOTION_SOUL_PAGE_ID=...
NOTION_MEMORY_PAGE_ID=...
NOTION_SKILLS_DB_ID=...
NOTION_TASKS_DB_ID=...
NOTION_HEARTBEAT_DB_ID=...
HEARTBEAT_CRON=*/30 * * * *
AGENT_NAME=Molty
```

**To find your Telegram chat ID:** message `@userinfobot` on Telegram.
It will reply with your numeric ID.

---

## 4. Run It

```bash
# Install dependencies
npm install

# Start everything (gateway + heartbeat)
npm start

# OR: trigger a test heartbeat immediately
npm run heartbeat

# OR: gateway only (no proactive heartbeat)
npm run gateway

# OR: development mode with auto-reload
npm run dev
```

---

## 5. Verify It's Working

1. Open Telegram and message your bot `/start`
2. You should get a welcome message from your agent
3. Send: `"Add a task: test that not-claw is working, priority high"`
4. The agent should create a row in your Tasks database in Notion
5. Wait for a heartbeat (or trigger one with `npm run heartbeat`)
6. The agent should pick up the task, work on it, and message you back

---

## Tips

- **Skills are how the agent learns.** Tell it to "save this as a skill" and
  it will write a new page to the Skills database, available in future sessions.
- **The Soul page defines the agent's identity.** Edit it directly in Notion to
  shape the agent's personality and give it context about you.
- **The Memory page grows over time.** The agent appends to it after each session.
  You can also edit it directly to give the agent facts about your life.
- **Tasks can be anything.** The agent will try to complete them on heartbeat.
  Keep them small and specific for best results.
- **Run on a VPS or always-on machine** for true async proactive behavior.
  A $5/mo DigitalOcean droplet works great.
