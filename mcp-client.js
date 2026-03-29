/**
 * mcp-client.js
 *
 * Connects to the Notion MCP server as a local stdio subprocess.
 * Discovers available tools and executes them on behalf of the agent.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import "dotenv/config";

let client = null;
let transport = null;
let cachedTools = null;
let cachedFilteredTools = null;

// Tools the agent actually uses (filters out ~14 unused tools to save tokens)
const ALLOWED_TOOLS = [
  "API-retrieve-a-page",
  "API-get-block-children",
  "API-patch-block-children",
  "API-post-search",
  "API-retrieve-a-database",
  "API-post-page",
  "API-patch-page",
  "API-retrieve-a-page-property",
];

/**
 * Initialize the MCP client and connect to the local Notion MCP server.
 */
export async function connectMcp() {
  if (client) return client;

  const token = process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error("NOTION_API_KEY not set in .env");
  }

  transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      ...process.env,
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2022-06-28",
      }),
    },
  });

  client = new Client({ name: "not-claw", version: "1.0.0" });
  await client.connect(transport);
  console.log("[mcp] Connected to Notion MCP server (stdio)");
  return client;
}

/**
 * Discover tools from the Notion MCP server.
 * Returns them in Anthropic tool-use format.
 */
export async function getTools() {
  if (cachedTools) return cachedTools;

  const mcp = await connectMcp();
  const { tools } = await mcp.listTools();

  console.log(`[mcp] Discovered ${tools.length} tools`);

  cachedTools = tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    input_schema: t.inputSchema,
  }));

  return cachedTools;
}

/**
 * Get filtered tools (only the ones the agent actually uses).
 * Reduces input tokens by ~1000 per API call.
 */
export async function getFilteredTools() {
  if (cachedFilteredTools) return cachedFilteredTools;

  const allTools = await getTools();
  cachedFilteredTools = allTools.filter((t) => ALLOWED_TOOLS.includes(t.name));
  console.log(`[mcp] Filtered to ${cachedFilteredTools.length} tools`);

  return cachedFilteredTools;
}

/**
 * Check if there are pending tasks in the Tasks DB.
 * Direct MCP call — no Claude API usage.
 * Returns true if there are pending/in-progress tasks.
 */
export async function checkPendingTasks() {
  const tasksDbId = process.env.NOTION_TASKS_DB_ID;
  if (!tasksDbId) {
    console.error("[mcp] NOTION_TASKS_DB_ID not set");
    return true; // Assume tasks exist if we can't check
  }

  try {
    await connectMcp();
    const result = await callTool("API-post-search", {
      body: JSON.stringify({
        filter: {
          property: "object",
          value: "page",
        },
        query: "",
      }),
    });

    // Parse result and look for pending/in-progress tasks in our Tasks DB
    const data = JSON.parse(result);
    const pendingTasks = (data.results || []).filter((page) => {
      if (page.parent?.database_id?.replace(/-/g, "") !== tasksDbId.replace(/-/g, "")) {
        return false;
      }
      const status = page.properties?.Status?.select?.name;
      return status === "pending" || status === "in-progress";
    });

    console.log(`[mcp] Found ${pendingTasks.length} pending/in-progress tasks`);
    return pendingTasks.length > 0;
  } catch (err) {
    console.error("[mcp] Error checking pending tasks:", err.message);
    return true; // Assume tasks exist on error
  }
}

/**
 * Execute a tool call via the MCP server.
 */
export async function callTool(name, args) {
  const mcp = await connectMcp();
  const result = await mcp.callTool({ name, arguments: args });

  const text = (result.content || [])
    .map((block) => {
      if (block.type === "text") return block.text;
      return JSON.stringify(block);
    })
    .join("\n");

  return text;
}

/**
 * Disconnect the MCP client.
 */
export async function disconnectMcp() {
  if (client) {
    await client.close();
    client = null;
    transport = null;
    cachedTools = null;
    cachedFilteredTools = null;
    console.log("[mcp] Disconnected");
  }
}
