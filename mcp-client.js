/**
 * mcp-client.js
 *
 * Manages multiple MCP server connections (Notion, Fetch, Brave Search).
 * Discovers available tools from all servers and routes tool calls to the
 * correct server.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getGoogleToolDefinitions, callGoogleTool, isGoogleTool } from "./google-tools.js";
import "dotenv/config";

/**
 * Registry of MCP server definitions.
 * Each entry describes how to spawn the server and which tools to expose.
 */
function getServerConfigs() {
  const configs = {};

  // Notion MCP — always enabled
  const notionKey = process.env.NOTION_API_KEY;
  if (notionKey) {
    configs.notion = {
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: {
        ...process.env,
        OPENAPI_MCP_HEADERS: JSON.stringify({
          Authorization: `Bearer ${notionKey}`,
          "Notion-Version": "2022-06-28",
        }),
      },
      // Only expose the tools the agent actually uses
      allowedTools: [
        "API-retrieve-a-page",
        "API-get-block-children",
        "API-patch-block-children",
        "API-post-search",
        "API-retrieve-a-database",
        "API-query-a-database",
        "API-post-page",
        "API-patch-page",
        "API-retrieve-a-page-property",
      ],
    };
  }

  // Fetch MCP — always enabled (no credentials needed)
  configs.fetch = {
    command: "npx",
    args: ["-y", "mcp-server-fetch-typescript"],
    env: { ...process.env },
    allowedTools: null, // expose all tools
  };

  // Brave Search MCP — enabled when BRAVE_API_KEY is set
  const braveKey = process.env.BRAVE_API_KEY;
  if (braveKey) {
    configs["brave-search"] = {
      command: "npx",
      args: ["-y", "@brave/brave-search-mcp-server"],
      env: { ...process.env, BRAVE_API_KEY: braveKey },
      allowedTools: null, // expose all tools
    };
  }

  return configs;
}

// State: one client + transport per server
const servers = {}; // { [name]: { client, transport } }
let cachedTools = null;
let cachedFilteredTools = null;
// Maps tool name → server name for routing
const toolServerMap = {};

/**
 * Connect to a single MCP server by name.
 */
async function connectServer(name, config) {
  if (servers[name]?.client) return servers[name].client;

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
  });

  const client = new Client({ name: `not-claw-${name}`, version: "1.0.0" });
  await client.connect(transport);
  servers[name] = { client, transport };
  console.log(`[mcp] Connected to ${name} MCP server (stdio)`);
  return client;
}

/**
 * Initialize all MCP server connections.
 */
export async function connectMcp() {
  const configs = getServerConfigs();
  const pending = [];

  for (const [name, config] of Object.entries(configs)) {
    if (!servers[name]?.client) {
      pending.push(
        connectServer(name, config).catch((err) => {
          console.error(`[mcp] Failed to connect ${name}:`, err.message);
        })
      );
    }
  }

  if (pending.length > 0) {
    await Promise.all(pending);
  }
}

/**
 * Discover tools from all connected MCP servers.
 * Returns them in Anthropic tool-use format.
 */
export async function getTools() {
  if (cachedTools) return cachedTools;

  await connectMcp();
  const allTools = [];

  for (const [name, { client }] of Object.entries(servers)) {
    if (!client) continue;

    try {
      const { tools } = await client.listTools();
      console.log(`[mcp] ${name}: discovered ${tools.length} tools`);

      for (const t of tools) {
        toolServerMap[t.name] = name;
        allTools.push({
          name: t.name,
          description: t.description || "",
          input_schema: t.inputSchema,
        });
      }
    } catch (err) {
      console.error(`[mcp] Error listing tools for ${name}:`, err.message);
    }
  }

  // Register custom Google tools (not MCP — direct API wrappers)
  const googleTools = getGoogleToolDefinitions();
  for (const t of googleTools) {
    toolServerMap[t.name] = "google";
    allTools.push(t);
  }
  if (googleTools.length > 0) {
    console.log(`[mcp] google: registered ${googleTools.length} custom tools`);
  }

  console.log(`[mcp] Total tools discovered: ${allTools.length}`);
  cachedTools = allTools;
  return cachedTools;
}

/**
 * Get filtered tools (Notion filtered to allowed list, others pass through).
 * Reduces input tokens by removing unused Notion tools.
 */
export async function getFilteredTools() {
  if (cachedFilteredTools) return cachedFilteredTools;

  const allTools = await getTools();
  const configs = getServerConfigs();

  cachedFilteredTools = allTools.filter((t) => {
    const serverName = toolServerMap[t.name];
    const config = configs[serverName];
    if (!config || !config.allowedTools) return true;
    return config.allowedTools.includes(t.name);
  });

  console.log(`[mcp] Filtered to ${cachedFilteredTools.length} tools`);
  return cachedFilteredTools;
}

/**
 * Fetch pending/in-progress tasks from the Tasks DB.
 * Direct MCP call — no Claude API usage.
 * Returns an array of task summaries, or null on error.
 */
export async function fetchPendingTasks() {
  const tasksDbId = process.env.NOTION_TASKS_DB_ID;
  if (!tasksDbId) {
    console.error("[mcp] NOTION_TASKS_DB_ID not set");
    return null;
  }

  try {
    await connectMcp();
    await getTools(); // ensure tool map is populated before callTool
    const result = await callTool("API-query-a-database", {
      database_id: tasksDbId,
      body: JSON.stringify({
        filter: {
          or: [
            { property: "Status", select: { equals: "pending" } },
            { property: "Status", select: { equals: "in-progress" } },
          ],
        },
      }),
    });

    const data = JSON.parse(result);
    const pages = data.results || [];
    console.log(`[mcp] Found ${pages.length} pending/in-progress task(s)`);

    return pages.map((page) => ({
      id: page.id,
      name: page.properties?.Name?.title?.[0]?.plain_text || "(untitled)",
      status: page.properties?.Status?.select?.name || page.properties?.Status?.status?.name || "unknown",
      priority: page.properties?.Priority?.select?.name || "none",
      notes: page.properties?.Notes?.rich_text?.[0]?.plain_text || "",
    }));
  } catch (err) {
    console.error("[mcp] Error fetching pending tasks:", err.message);
    return null;
  }
}

/**
 * Execute a tool call, routing to the correct MCP server.
 */
export async function callTool(name, args) {
  // Route Google tools to custom handlers (no MCP server)
  if (isGoogleTool(name)) {
    return await callGoogleTool(name, args);
  }

  const serverName = toolServerMap[name];
  if (!serverName || !servers[serverName]?.client) {
    throw new Error(`Unknown tool or server not connected: ${name}`);
  }

  const result = await servers[serverName].client.callTool({
    name,
    arguments: args,
  });

  const text = (result.content || [])
    .map((block) => {
      if (block.type === "text") return block.text;
      return JSON.stringify(block);
    })
    .join("\n");

  return text;
}

/**
 * Disconnect all MCP clients.
 */
export async function disconnectMcp() {
  const pending = [];
  for (const [name, { client }] of Object.entries(servers)) {
    if (client) {
      pending.push(
        client.close().then(() => {
          console.log(`[mcp] Disconnected ${name}`);
        })
      );
    }
  }
  await Promise.all(pending);

  // Reset state
  for (const name of Object.keys(servers)) delete servers[name];
  cachedTools = null;
  cachedFilteredTools = null;
  for (const key of Object.keys(toolServerMap)) delete toolServerMap[key];
}
