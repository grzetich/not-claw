/**
 * notion.js
 *
 * Thin wrapper around the Notion REST API. Exposes the operations the agent
 * needs as simple async functions, and defines matching Claude tool schemas.
 */

import "dotenv/config";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const headers = {
  Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
};

async function notionFetch(path, options = {}) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status}: ${body}`);
  }
  return res.json();
}

// ── API functions ──────────────────────────────────────────────────────

export async function getPage(pageId) {
  return notionFetch(`/pages/${pageId}`);
}

export async function getPageContent(blockId) {
  const blocks = [];
  let cursor;
  do {
    const params = cursor ? `?start_cursor=${cursor}` : "";
    const res = await notionFetch(`/blocks/${blockId}/children${params}`);
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return blocks;
}

export async function appendBlocks(blockId, children) {
  return notionFetch(`/blocks/${blockId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children }),
  });
}

export async function queryDatabase(databaseId, filter, sorts) {
  const body = {};
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  return notionFetch(`/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createPage(parentDbId, properties) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: parentDbId },
      properties,
    }),
  });
}

export async function updatePage(pageId, properties) {
  return notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

export async function searchNotion(queryText) {
  return notionFetch("/search", {
    method: "POST",
    body: JSON.stringify({ query: queryText, page_size: 10 }),
  });
}

// ── Claude tool definitions ────────────────────────────────────────────

export const notionTools = [
  {
    name: "get_page_content",
    description:
      "Read the content (blocks) of a Notion page or block. Use this to read the Soul page, Memory page, or any skill page.",
    input_schema: {
      type: "object",
      properties: {
        block_id: {
          type: "string",
          description: "The Notion page or block ID to read",
        },
      },
      required: ["block_id"],
    },
  },
  {
    name: "append_to_page",
    description:
      "Append text blocks to a Notion page. Use this to add to the Memory page or write skill content.",
    input_schema: {
      type: "object",
      properties: {
        block_id: {
          type: "string",
          description: "The page or block ID to append to",
        },
        text: {
          type: "string",
          description: "The text content to append as a paragraph block",
        },
      },
      required: ["block_id", "text"],
    },
  },
  {
    name: "query_database",
    description:
      "Query a Notion database with optional filter and sort. Use this for Tasks, Skills, and Heartbeat databases.",
    input_schema: {
      type: "object",
      properties: {
        database_id: {
          type: "string",
          description: "The database ID to query",
        },
        filter: {
          type: "object",
          description:
            "Optional Notion filter object (e.g. { property: 'Status', select: { equals: 'pending' } })",
        },
        sorts: {
          type: "array",
          description:
            "Optional array of sort objects (e.g. [{ property: 'Priority', direction: 'ascending' }])",
        },
      },
      required: ["database_id"],
    },
  },
  {
    name: "create_database_entry",
    description:
      "Create a new page/row in a Notion database. Use this to add tasks, skills, or heartbeat log entries.",
    input_schema: {
      type: "object",
      properties: {
        database_id: {
          type: "string",
          description: "The database ID to add to",
        },
        properties: {
          type: "object",
          description:
            'Notion properties object. Title fields use { "Name": { "title": [{ "text": { "content": "..." } }] } }. Select fields use { "Status": { "select": { "name": "pending" } } }.',
        },
      },
      required: ["database_id", "properties"],
    },
  },
  {
    name: "update_database_entry",
    description:
      "Update properties on an existing Notion page/row. Use this to change task status, add notes, etc.",
    input_schema: {
      type: "object",
      properties: {
        page_id: {
          type: "string",
          description: "The page ID to update",
        },
        properties: {
          type: "object",
          description: "Notion properties object with fields to update",
        },
      },
      required: ["page_id", "properties"],
    },
  },
  {
    name: "search_notion",
    description:
      "Search across the entire Notion workspace by text query. Use this to find skills, tasks, or any content.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query text",
        },
      },
      required: ["query"],
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────────

export async function executeTool(name, input) {
  switch (name) {
    case "get_page_content": {
      const blocks = await getPageContent(input.block_id);
      // Extract text content from blocks for readability
      const text = blocks
        .map((b) => {
          const type = b.type;
          const content = b[type];
          if (!content) return "";
          if (content.rich_text) {
            return content.rich_text.map((t) => t.plain_text).join("");
          }
          if (content.text) {
            return content.text.map((t) => t.plain_text).join("");
          }
          return JSON.stringify(content);
        })
        .filter(Boolean)
        .join("\n");
      return text || "(empty page)";
    }

    case "append_to_page":
      await appendBlocks(input.block_id, [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: input.text } }],
          },
        },
      ]);
      return "Appended successfully.";

    case "query_database": {
      const result = await queryDatabase(
        input.database_id,
        input.filter,
        input.sorts
      );
      // Summarize results
      const rows = result.results.map((page) => {
        const props = {};
        for (const [key, val] of Object.entries(page.properties)) {
          if (val.title) props[key] = val.title.map((t) => t.plain_text).join("");
          else if (val.select) props[key] = val.select?.name || null;
          else if (val.rich_text)
            props[key] = val.rich_text.map((t) => t.plain_text).join("");
          else if (val.date) props[key] = val.date?.start || null;
          else if (val.number) props[key] = val.number;
          else props[key] = val.type;
        }
        return { id: page.id, ...props };
      });
      return JSON.stringify(rows, null, 2);
    }

    case "create_database_entry": {
      const page = await createPage(input.database_id, input.properties);
      return `Created page: ${page.id}`;
    }

    case "update_database_entry": {
      await updatePage(input.page_id, input.properties);
      return `Updated page: ${input.page_id}`;
    }

    case "search_notion": {
      const result = await searchNotion(input.query);
      const items = result.results.map((r) => ({
        id: r.id,
        type: r.object,
        title:
          r.properties?.title?.title?.map((t) => t.plain_text).join("") ||
          r.properties?.Name?.title?.map((t) => t.plain_text).join("") ||
          r.url ||
          r.id,
      }));
      return JSON.stringify(items, null, 2);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
