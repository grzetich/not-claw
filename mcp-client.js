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
    console.log("[mcp] Disconnected");
  }
}
