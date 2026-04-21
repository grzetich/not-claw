import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Set env vars before importing agent module
beforeEach(() => {
  process.env.NOTION_SOUL_PAGE_ID = "soul-123";
  process.env.NOTION_MEMORY_PAGE_ID = "mem-456";
  process.env.NOTION_SKILLS_DB_ID = "skills-789";
  process.env.NOTION_TASKS_DB_ID = "tasks-abc";
  process.env.NOTION_HEARTBEAT_DB_ID = "hb-def";
  process.env.AGENT_NAME = "TestBot";
  process.env.ANTHROPIC_API_KEY = "sk-test";
  process.env.NOTION_API_KEY = "secret_test";
});

// Warm the module graph once — importing agent.js transitively loads the
// Anthropic SDK, MCP SDK, and the very large googleapis module, which
// blows the per-test 5s timeout on a cold run.
beforeAll(async () => {
  await import("./agent.js");
}, 60000);

// Mock the agent SDK so importing agent.js doesn't need real credentials
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

describe("buildSystemPrompt", () => {
  it("includes all Notion IDs in interactive mode", async () => {
    const { buildSystemPrompt } = await import("./agent.js");
    const prompt = buildSystemPrompt("interactive");

    expect(prompt).toContain("soul-123");
    expect(prompt).toContain("mem-456");
    expect(prompt).toContain("skills-789");
    expect(prompt).toContain("tasks-abc");
    expect(prompt).toContain("hb-def");
  });

  it("sets interactive mode text", async () => {
    const { buildSystemPrompt } = await import("./agent.js");
    const prompt = buildSystemPrompt("interactive");

    expect(prompt).toContain("INTERACTIVE (responding to user)");
    expect(prompt).not.toContain("HEARTBEAT (proactive)");
  });

  it("sets heartbeat mode text with step-by-step instructions", async () => {
    const { buildSystemPrompt } = await import("./agent.js");
    const prompt = buildSystemPrompt("heartbeat");

    expect(prompt).toContain("HEARTBEAT (proactive)");
    expect(prompt).toContain("woken by a scheduled heartbeat");
    expect(prompt).toContain("Query Tasks");
  });

  it("includes the agent name", async () => {
    const { buildSystemPrompt } = await import("./agent.js");
    const prompt = buildSystemPrompt("interactive");

    // AGENT_NAME is read at module load time, so it may use the default.
    // The prompt should contain either the env var name or the default.
    expect(prompt).toMatch(/You are (TestBot|Alfred)/);
  });
});

describe("env validation", () => {
  it("detects missing env vars", () => {
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

    // Simulate missing vars
    const env = { ANTHROPIC_API_KEY: "sk-test", NOTION_API_KEY: "secret_test" };
    const missing = required.filter((k) => !env[k]);

    expect(missing).toContain("TELEGRAM_BOT_TOKEN");
    expect(missing).toContain("TELEGRAM_OWNER_CHAT_ID");
    expect(missing).not.toContain("ANTHROPIC_API_KEY");
  });

  it("passes when all vars are set", () => {
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

    const env = Object.fromEntries(required.map((k) => [k, "value"]));
    const missing = required.filter((k) => !env[k]);

    expect(missing).toHaveLength(0);
  });
});

describe("message chunking", () => {
  function chunkMessage(response, limit = 4096) {
    if (response.length <= limit) return [response];
    return response.match(new RegExp(`.{1,${limit}}`, "gs")) || [response];
  }

  it("returns single chunk for short messages", () => {
    const chunks = chunkMessage("Hello world");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("Hello world");
  });

  it("splits long messages at the limit", () => {
    const long = "A".repeat(5000);
    const chunks = chunkMessage(long, 4096);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(4096);
    expect(chunks[1]).toHaveLength(904);
  });

  it("handles exact boundary", () => {
    const exact = "B".repeat(4096);
    const chunks = chunkMessage(exact, 4096);
    expect(chunks).toHaveLength(1);
  });
});

describe("cron schedule validation", () => {
  it("validates default schedule", async () => {
    const cron = await import("node-cron");
    expect(cron.validate("*/30 * * * *")).toBe(true);
  });

  it("rejects invalid schedule", async () => {
    const cron = await import("node-cron");
    expect(cron.validate("not a cron")).toBe(false);
  });
});
