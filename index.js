/**
 * index.js
 *
 * Main entry point. Boots the Telegram gateway and the heartbeat scheduler
 * together. This is the single process you run on your machine (or VPS)
 * to bring notion-claw to life.
 *
 * Usage:
 *   node index.js              - Run everything (gateway + heartbeat)
 *   node index.js --heartbeat  - Trigger one heartbeat run and exit
 *   node index.js --gateway    - Run gateway only (no heartbeat)
 */

import "dotenv/config";
import { startGateway, bot } from "./gateway.js";
import { startHeartbeat, runHeartbeat } from "./heartbeat.js";


// Validate required env vars before doing anything
const required = [
  "ANTHROPIC_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_OWNER_CHAT_ID",
  "NOTION_API_KEY",
  "NOTION_SOUL_PAGE_ID",
  "NOTION_MEMORY_PAGE_ID",
  "NOTION_SKILLS_DB_ID",
  "NOTION_TASKS_DB_ID",
  "NOTION_HEARTBEAT_DB_ID",
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `\n❌ Missing required environment variables:\n  ${missing.join("\n  ")}\n`
  );
  console.error("Copy .env.example to .env and fill in your values.\n");
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.includes("--heartbeat")) {
  // One-shot heartbeat for testing or manual trigger
  console.log("[notion-claw] Running one-shot heartbeat...");
  // We need the bot initialized to send messages
  startGateway();
  // Give the bot a moment to connect before we fire the heartbeat
  setTimeout(async () => {
    await runHeartbeat();
    process.exit(0);
  }, 2000);
} else if (args.includes("--gateway")) {
  // Gateway only - useful if you want a separate heartbeat process
  startGateway();
} else {
  // Normal mode: gateway + heartbeat together
  startGateway();
  startHeartbeat();
  console.log(
    `\n🦞 notion-claw is running. Talk to your agent on Telegram.\n`
  );
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[notion-claw] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[notion-claw] Shutting down...");
  process.exit(0);
});
