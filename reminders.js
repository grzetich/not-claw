/**
 * reminders.js
 *
 * Lightweight reminder loop that runs every minute. Queries the Tasks
 * database via Notion MCP for tasks with a DueAt in the past and status
 * "pending", sends a Telegram notification, and marks them done.
 *
 * No Claude calls — just direct MCP tool calls. Zero API credits.
 */

import cron from "node-cron";
import { connectMcp, callTool } from "./mcp-client.js";
import { bot } from "./gateway.js";
import "dotenv/config";

const OWNER_ID = parseInt(process.env.TELEGRAM_OWNER_CHAT_ID, 10);
const TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID;
const AGENT_NAME = process.env.AGENT_NAME || "Alfred";

let reminderRunning = false;

async function checkReminders() {
  if (reminderRunning) return;
  reminderRunning = true;

  try {
    await connectMcp();

    // Query for pending tasks with a DueAt that has passed
    const now = new Date().toISOString();
    const result = await callTool("API-query-data-source", {
      data_source_id: TASKS_DB_ID,
      filter: JSON.stringify({
        and: [
          { property: "Status", select: { equals: "pending" } },
          { property: "DueAt", date: { on_or_before: now } },
        ],
      }),
    });

    let tasks;
    try {
      tasks = JSON.parse(result);
    } catch {
      // Result might be a message like "no results" or malformed
      return;
    }

    const rows = tasks.results || tasks;
    if (!Array.isArray(rows) || rows.length === 0) return;

    for (const task of rows) {
      // Extract task name
      const nameProp = task.properties?.Name;
      const name = nameProp?.title
        ?.map((t) => t.plain_text)
        .join("") || "Unnamed task";

      // Extract notes if any
      const notesProp = task.properties?.Notes;
      const notes = notesProp?.rich_text
        ?.map((t) => t.plain_text)
        .join("") || "";

      // Send Telegram reminder
      const message = notes
        ? `*🔔 Reminder:* ${name}\n\n${notes}`
        : `*🔔 Reminder:* ${name}`;

      try {
        await bot.api.sendMessage(OWNER_ID, message, {
          parse_mode: "Markdown",
        });
        console.log(`[reminders] Sent reminder: ${name}`);
      } catch (err) {
        console.error(`[reminders] Telegram error:`, err.message);
        continue;
      }

      // Mark the task as done
      try {
        await callTool("API-patch-page", {
          page_id: task.id,
          properties: JSON.stringify({
            Status: { select: { name: "done" } },
            CompletedAt: { date: { start: now } },
          }),
        });
      } catch (err) {
        console.error(`[reminders] Failed to update task ${task.id}:`, err.message);
      }
    }
  } catch (err) {
    // Don't crash the process on reminder errors
    console.error("[reminders] Error:", err.message);
  } finally {
    reminderRunning = false;
  }
}

export function startReminders() {
  console.log("[reminders] Starting reminder loop (every minute)");
  cron.schedule("* * * * *", checkReminders);
}
