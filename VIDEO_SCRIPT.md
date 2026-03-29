# not-claw Video Demo Script

Target length: 3-4 minutes. Screen record with voiceover.

---

## Scene 1: Intro (15 sec)

**Show:** Terminal with the project directory, then `npm start` output.

**Say:** "This is not-claw — a personal AI agent that lives in Telegram and thinks in Notion. It's inspired by OpenClaw, but instead of Markdown files on disk, it uses the Notion MCP server as its entire brain. Let me show you how it works."

**On screen:** The startup logs showing MCP connection, 22 tools discovered, and heartbeat scheduler active.

**Note:** Make sure `TIMEZONE` is set in your `.env` (e.g. `America/New_York`) — the agent gets your exact local time injected into every prompt so time math works correctly.

---

## Scene 2: Notion workspace tour (30 sec)

**Show:** Notion, switching between each page/database.

**Say:** "Here's the agent's brain in Notion. This is the Soul page — it defines the agent's personality and what it knows about me. This is the Memory page — the agent reads it every session and appends new facts over time. Here's the Skills database — each page is an instruction the agent can look up and follow. The Tasks database is the work queue. And the Heartbeat log tracks every time the agent wakes up on its own."

**On screen:** Click through Soul page → Memory page → Skills DB → Tasks DB → Heartbeat log.

---

## Scene 3: Chat interaction — add a task (30 sec)

**Show:** Telegram chat with the bot. Split screen with Notion Tasks database open.

**Say:** "Let's talk to it. I'll ask it to add a task."

**Type in Telegram:** "Add a task: write a blog post about MCP servers, priority high"

**Wait for response.** Agent should confirm the task was created.

**Say:** "And if I flip to Notion..."

**Show:** Refresh the Tasks database — new row appears with status "pending" and priority "high".

**Say:** "There it is. The agent used Notion MCP to create that row — I didn't write any Notion API code."

---

## Scene 4: Ask about tasks (15 sec)

**Show:** Telegram chat.

**Type:** "What tasks are pending?"

**Wait for response.** Agent should list tasks grouped by priority.

**Say:** "It queries the Tasks database through MCP and summarizes what it finds."

---

## Scene 5: Heartbeat (45 sec)

**Show:** Terminal. Split screen with Notion and Telegram.

**Say:** "The killer feature is the heartbeat. Every 30 minutes, the agent wakes up on its own and runs Claude Haiku — about 60x cheaper than Sonnet — to check for pending tasks and do the work. Let me trigger one manually."

**Run:** `npm run heartbeat`

**Show:** Terminal logs — MCP tool calls scrolling by (reading Memory, querying Tasks, updating status, logging heartbeat).

**Say:** "It reads memory, checks for tasks, works the highest-priority one, updates Notion, and logs the run."

**Show:** Telegram — heartbeat notification arrives.

**Show:** Notion — Task status changed, Heartbeat log has new entry.

**Say:** "I didn't ask it to do that. It just woke up, checked Notion, and got to work."

---

## Scene 6: Teach a skill (30 sec)

**Show:** Telegram chat. Split screen with Notion Skills database.

**Type:** "Learn how to prioritize my tasks by deadline and save it as a skill"

**Wait for response.**

**Show:** Notion Skills database — new skill page appeared.

**Say:** "The agent just wrote a new skill page to Notion. Next time I ask it to prioritize tasks, it'll look up these instructions. It teaches itself through Notion MCP."

---

## Scene 7: Two-way collaboration (20 sec)

**Show:** Notion Tasks database. Manually add a new task row directly in Notion (not through the bot).

**Say:** "And here's what makes Notion the right choice for this. I can go directly into Notion and add a task, edit a skill, or correct the agent's memory. The bot and I are just two users of the same workspace. I don't have to go through the bot for everything — I can work in Notion naturally, and the agent picks up my changes on the next heartbeat."

**Show:** Briefly click into the Skills database and Memory page to reinforce the point.

---

## Scene 8: Wrap up (15 sec)

**Show:** The architecture diagram from the README, or a split of terminal + Notion + Telegram.

**Say:** "That's not-claw. Sonnet for chat, Haiku for heartbeats — both configurable if you want to swap models. Notion MCP for persistence, Telegram for the interface. The agent's entire brain is in Notion — visible, editable, and always available. Link to the repo in the description."

---

## Recording tips

- Use a clean Telegram chat (clear history before recording)
- Have the Notion workspace open in a browser alongside Telegram
- Use split screen or quick tab switches to show both at once
- Keep the terminal visible during heartbeat to show MCP tool calls in real time
- The agent takes 5-15 seconds to respond — either speed up in editing or keep talking during the wait
- Make sure the Soul/Memory pages have some content so the agent's first response is personalized
