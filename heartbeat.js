/**
 * heartbeat.js
 *
 * The heartbeat. Fires on a cron schedule, wakes the agent, and lets it
 * work through pending tasks proactively without waiting for a user message.
 *
 * This is the killer feature that makes notion-claw feel like OpenClaw:
 * the agent does things while you sleep, then reports back to Telegram.
 *
 * Equivalent to OpenClaw's HEARTBEAT.md + the cron job that reads it.
 */

import cron from "node-cron";
import { runAgent } from "./agent.js";
import { fetchPendingTasks } from "./mcp-client.js";
import { bot } from "./gateway.js";
import "dotenv/config";

const OWNER_ID = parseInt(process.env.TELEGRAM_OWNER_CHAT_ID, 10);
const SCHEDULE = process.env.HEARTBEAT_CRON || "*/30 * * * *";
const AGENT_NAME = process.env.AGENT_NAME || "Molty";

let heartbeatRunning = false;

async function runHeartbeat() {
  if (heartbeatRunning) {
    console.log("[heartbeat] Previous run still in progress, skipping.");
    return;
  }

  heartbeatRunning = true;
  const timestamp = new Date().toISOString();
  console.log(`[heartbeat] Waking at ${timestamp}`);

  // Pre-fetch pending tasks (saves the model from querying + filtering)
  const tasks = await fetchPendingTasks();
  if (!tasks || tasks.length === 0) {
    console.log("[heartbeat] No pending tasks, skipping agent run.");
    heartbeatRunning = false;
    return;
  }

  const taskList = tasks
    .map((t) => `- [${t.priority}] "${t.name}" (status: ${t.status}, id: ${t.id})${t.notes ? ` — ${t.notes}` : ""}`)
    .join("\n");

  const prompt = `
HEARTBEAT TRIGGER - ${timestamp}

You've been woken by a scheduled heartbeat check. This is proactive mode.

## Pending tasks (pre-loaded, no need to query)

${taskList}

## Instructions

1. Read your Memory page for context.
2. Pick the highest priority task from the list above and work on it.
   Use the task's page ID to update it directly with API-patch-page.
   Set Status to "in-progress" (or "done" if you complete it).
   Add notes about what you did in the task's Notes field.
3. Log this heartbeat run in the Heartbeat log database with:
   - Timestamp: now
   - Summary: what you found and did
   - TasksActedOn: which task(s) you touched
   - Outcome: result
4. Update your Memory page if you learned anything new.
5. Return a brief, friendly Telegram-ready summary of what happened.
   Start with one of these emojis to indicate status:
   ✅ if you completed or progressed a task
   💤 if there was nothing to do (no pending tasks)
   ⚠️ if you hit a problem
`;

  try {
    const result = await runAgent(prompt, "heartbeat");

    // Only ping Telegram if there's something worth reporting
    if (!result.includes("💤")) {
      await bot.api.sendMessage(
        OWNER_ID,
        `*💓 ${AGENT_NAME} heartbeat*\n\n${result}`,
        { parse_mode: "Markdown" }
      );
    } else {
      console.log("[heartbeat] Nothing to report, skipping Telegram message.");
    }
  } catch (err) {
    console.error("[heartbeat] Error:", err.message);
    try {
      await bot.api.sendMessage(
        OWNER_ID,
        `⚠️ *${AGENT_NAME} heartbeat error*\n\n${err.message}`,
        { parse_mode: "Markdown" }
      );
    } catch (_) {
      // If Telegram also fails, just log it
    }
  } finally {
    heartbeatRunning = false;
  }
}

export function startHeartbeat() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[heartbeat] Invalid cron expression: "${SCHEDULE}"`);
    process.exit(1);
  }

  console.log(`[heartbeat] Scheduling heartbeat: ${SCHEDULE}`);
  cron.schedule(SCHEDULE, runHeartbeat);

  console.log("[heartbeat] Scheduler active.");
}

// Allow triggering a manual heartbeat from the CLI for testing
export { runHeartbeat };
