/**
 * gateway.js
 *
 * The front door. Runs a Telegram bot that relays messages from the owner
 * to the agent, and delivers responses back. Only the owner's chat ID can
 * talk to the agent (set TELEGRAM_OWNER_CHAT_ID in .env).
 *
 * Equivalent to OpenClaw's Gateway process - the single long-running
 * process that handles channel connections and routes messages.
 */

import { Bot } from "grammy";
import { runAgent } from "./agent.js";
import "dotenv/config";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const OWNER_ID = parseInt(process.env.TELEGRAM_OWNER_CHAT_ID, 10);
const AGENT_NAME = process.env.AGENT_NAME || "Molty";

// Track in-flight requests so we don't pile up parallel agent loops
let agentBusy = false;

// Owner-only middleware
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== OWNER_ID) {
    await ctx.reply("Sorry, I only talk to my owner.");
    return;
  }
  await next();
});

// /start command
bot.command("start", async (ctx) => {
  await ctx.reply(
    `👋 Hey! I'm *${AGENT_NAME}*, your personal AI agent.\n\n` +
      `My brain lives in Notion — I remember things across sessions, ` +
      `learn new skills, and work on tasks even while you sleep.\n\n` +
      `Just talk to me naturally. Try:\n` +
      `• _"Add a task: draft newsletter"_\n` +
      `• _"What tasks are pending?"_\n` +
      `• _"Remind me about X next time you wake up"_\n` +
      `• _"Learn how to do Y and save it as a skill"_`,
    { parse_mode: "Markdown" }
  );
});

// /status command - quick peek at state without running a full agent loop
bot.command("status", async (ctx) => {
  await ctx.reply(
    `*${AGENT_NAME} status*\n\n` +
      `🧠 Memory: Notion\n` +
      `📋 Task queue: Notion\n` +
      `⚙️ Skills: Notion\n` +
      `💓 Heartbeat: ${process.env.HEARTBEAT_CRON || "*/30 * * * *"}\n` +
      `🤖 Agent: ${agentBusy ? "busy" : "ready"}`,
    { parse_mode: "Markdown" }
  );
});

// /tasks command - shortcut to ask about pending tasks
bot.command("tasks", async (ctx) => {
  if (agentBusy) {
    await ctx.reply("⏳ I'm busy with something else. Try again in a moment.");
    return;
  }
  await handleMessage(ctx, "List all my pending and in-progress tasks from Notion, grouped by priority.");
});

// All other text messages go straight to the agent
bot.on("message:text", async (ctx) => {
  if (agentBusy) {
    await ctx.reply("⏳ I'm still working on something. Hang tight...");
    return;
  }
  await handleMessage(ctx, ctx.message.text);
});

async function handleMessage(ctx, userText) {
  agentBusy = true;

  // Send a typing indicator
  await ctx.replyWithChatAction("typing");

  // For long operations, send a status message first
  const thinkingMsg = await ctx.reply(`🧠 On it...`);

  try {
    const response = await runAgent(userText, "interactive");

    // Delete the "thinking" message and send the real response
    try {
      await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
    } catch (_) {
      // Fine if delete fails (message too old etc.)
    }

    // Telegram has a 4096 char limit per message
    if (response.length <= 4096) {
      await ctx.reply(response, { parse_mode: "Markdown" });
    } else {
      // Split into chunks
      const chunks = response.match(/.{1,4000}/gs) || [response];
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      }
    }
  } catch (err) {
    console.error("[gateway] Agent error:", err.message);
    await ctx.reply(
      `❌ Something went wrong: ${err.message}\n\nCheck the logs.`
    );
  } finally {
    agentBusy = false;
  }
}

export function startGateway() {
  console.log(`[gateway] Starting ${AGENT_NAME} on Telegram...`);
  bot.start({
    onStart: () => console.log(`[gateway] Bot is live. Owner ID: ${OWNER_ID}`),
  });
  return bot;
}

export { bot };
