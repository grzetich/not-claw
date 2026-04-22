/**
 * notion-api.js
 *
 * Thin direct REST client for the Notion API. Used for deterministic,
 * fixed-shape operations the code does on its own — no LLM in the loop.
 *
 * We run a hybrid setup:
 *   - Notion MCP (mcp-client.js) — exposed to the LLM. The model decides
 *     which tools to call with which arguments. Flexible, discoverable.
 *   - Direct REST (this file)    — called from code when we already know
 *     exactly what we want. Faster (no stdio round-trip, no MCP spawn on
 *     cold paths) and returns JSON, not flattened text.
 *
 * Pick direct REST when the call is hard-coded in the source. Pick MCP
 * when Claude / the local model is deciding at runtime.
 */

import "dotenv/config";

const NOTION_API = "https://api.notion.com/v1";
const API_VERSION = "2022-06-28";

function headers() {
  const key = process.env.NOTION_API_KEY;
  if (!key) throw new Error("NOTION_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Notion-Version": API_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notion ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * POST /v1/databases/{id}/query
 */
export async function queryDatabase(databaseId, body = {}) {
  return notionFetch(`/databases/${databaseId}/query`, { method: "POST", body });
}

/**
 * GET /v1/blocks/{id}/children — paginated; collects all pages.
 */
export async function getBlockChildren(blockId) {
  const results = [];
  let cursor;
  do {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const data = await notionFetch(`/blocks/${blockId}/children${qs}`);
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

/**
 * POST /v1/pages — create a page under a database or parent page.
 * parent = { database_id } | { page_id }
 */
export async function createPage({ parent, properties, children }) {
  return notionFetch(`/pages`, {
    method: "POST",
    body: { parent, properties, ...(children ? { children } : {}) },
  });
}

/**
 * PATCH /v1/blocks/{id}/children — append blocks to a page/block.
 */
export async function appendBlockChildren(blockId, children) {
  return notionFetch(`/blocks/${blockId}/children`, {
    method: "PATCH",
    body: { children },
  });
}

/**
 * Fetch pending/in-progress rows from the Tasks DB.
 * Returns an array of {id, name, status, priority, notes} — empty when idle.
 * The heartbeat pre-fetches this to skip the full agent run when there's
 * nothing to do, and to inject the list into the prompt so the model
 * doesn't need to re-query.
 */
export async function fetchPendingTasks(tasksDbId = process.env.NOTION_TASKS_DB_ID) {
  if (!tasksDbId) {
    console.error("[notion-api] NOTION_TASKS_DB_ID not set");
    return null;
  }
  try {
    const data = await queryDatabase(tasksDbId, {
      filter: {
        or: [
          { property: "Status", status: { equals: "pending" } },
          { property: "Status", status: { equals: "in-progress" } },
        ],
      },
    });
    const pages = data.results || [];
    console.log(`[notion-api] Found ${pages.length} pending/in-progress task(s)`);

    return pages.map((page) => ({
      id: page.id,
      name: page.properties?.Name?.title?.[0]?.plain_text || "(untitled)",
      status: page.properties?.Status?.select?.name || page.properties?.Status?.status?.name || "unknown",
      priority: page.properties?.Priority?.select?.name || "none",
      notes: page.properties?.Notes?.rich_text?.[0]?.plain_text || "",
    }));
  } catch (err) {
    console.error("[notion-api] Error fetching pending tasks:", err.message);
    return null;
  }
}

/**
 * Fetch a page's body as plain text by flattening its block children.
 * Covers the block types a Soul/Memory page typically uses. Good enough
 * for injecting into a system prompt — not a full Markdown renderer.
 */
export async function getPageText(pageId) {
  const blocks = await getBlockChildren(pageId);
  return blocks.map(blockToText).filter(Boolean).join("\n");
}

function richTextToString(rt = []) {
  return rt.map((t) => t.plain_text || "").join("");
}

function blockToText(block) {
  const t = block[block.type];
  if (!t) return "";
  switch (block.type) {
    case "paragraph":
      return richTextToString(t.rich_text);
    case "heading_1":
      return `# ${richTextToString(t.rich_text)}`;
    case "heading_2":
      return `## ${richTextToString(t.rich_text)}`;
    case "heading_3":
      return `### ${richTextToString(t.rich_text)}`;
    case "bulleted_list_item":
      return `- ${richTextToString(t.rich_text)}`;
    case "numbered_list_item":
      return `1. ${richTextToString(t.rich_text)}`;
    case "to_do":
      return `[${t.checked ? "x" : " "}] ${richTextToString(t.rich_text)}`;
    case "quote":
      return `> ${richTextToString(t.rich_text)}`;
    case "code":
      return (
        "```" +
        (t.language || "") +
        "\n" +
        richTextToString(t.rich_text) +
        "\n```"
      );
    default:
      if (t.rich_text) return richTextToString(t.rich_text);
      return "";
  }
}
