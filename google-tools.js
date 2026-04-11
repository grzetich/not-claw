/**
 * google-tools.js
 *
 * Custom tool definitions and handlers for Google Docs and Gmail.
 * These are lightweight wrappers around the Google REST APIs — no MCP
 * server needed. Tool schemas are in Anthropic tool-use format so they
 * merge directly into the tool list alongside MCP tools.
 *
 * Tools:
 *   google_docs_search  — find docs by name/content via Drive API
 *   google_docs_read    — read full text of a Google Doc
 *   gmail_search        — search messages via Gmail query syntax
 *   gmail_read          — read a full email by message ID
 *   gmail_send          — send or reply to an email
 */

import { getDrive, getDocs, getGmail, isGoogleConfigured } from "./google-client.js";

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic format)
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  {
    name: "google_docs_search",
    description:
      "Search Google Drive for documents by name or content. Returns matching documents with their IDs, titles, and links.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query — matches document titles and content",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "google_docs_read",
    description:
      "Read the full text content of a Google Doc by its document ID.",
    input_schema: {
      type: "object",
      properties: {
        document_id: {
          type: "string",
          description: "The Google Doc ID (from the URL or from search results)",
        },
      },
      required: ["document_id"],
    },
  },
  {
    name: "gmail_search",
    description:
      'Search Gmail messages. Supports Gmail query syntax (e.g. "from:alice subject:meeting", "is:unread", "newer_than:7d"). Returns sender, subject, date, and snippet for each match.',
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "gmail_read",
    description: "Read the full content of a Gmail message by its message ID.",
    input_schema: {
      type: "object",
      properties: {
        message_id: {
          type: "string",
          description: "The Gmail message ID (from search results)",
        },
      },
      required: ["message_id"],
    },
  },
  {
    name: "gmail_send",
    description:
      "Send an email via Gmail. Can also reply to an existing thread by providing reply_to_message_id.",
    input_schema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        body: {
          type: "string",
          description: "Email body (plain text)",
        },
        reply_to_message_id: {
          type: "string",
          description:
            "Optional — the message ID to reply to (threads the reply)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleDocsSearch({ query, max_results = 10 }) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.document' and fullText contains '${query.replace(/'/g, "\\'")}'`,
    pageSize: max_results,
    fields: "files(id, name, modifiedTime, webViewLink)",
    orderBy: "modifiedTime desc",
  });

  const files = res.data.files || [];
  if (files.length === 0) return "No documents found.";
  return JSON.stringify(files, null, 2);
}

async function handleDocsRead({ document_id }) {
  const docs = getDocs();
  const res = await docs.documents.get({ documentId: document_id });

  const title = res.data.title;
  const text = extractDocText(res.data.body?.content || []);

  return JSON.stringify({ title, content: text });
}

/**
 * Recursively extract plain text from Google Docs structural elements.
 */
function extractDocText(content) {
  let text = "";
  for (const element of content) {
    if (element.paragraph) {
      for (const elem of element.paragraph.elements || []) {
        if (elem.textRun) {
          text += elem.textRun.content;
        }
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        const cells = [];
        for (const cell of row.tableCells || []) {
          cells.push(extractDocText(cell.content || []).trim());
        }
        text += cells.join("\t") + "\n";
      }
    }
    if (element.sectionBreak) {
      text += "\n";
    }
  }
  return text;
}

async function handleGmailSearch({ query, max_results = 10 }) {
  const gmail = getGmail();
  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: max_results,
  });

  const messageRefs = listRes.data.messages || [];
  if (messageRefs.length === 0) return "No messages found.";

  const messages = [];
  for (const ref of messageRefs) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: ref.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });

    const headers = {};
    for (const h of detail.data.payload?.headers || []) {
      headers[h.name] = h.value;
    }

    messages.push({
      id: ref.id,
      threadId: ref.threadId,
      from: headers.From || "",
      to: headers.To || "",
      subject: headers.Subject || "",
      date: headers.Date || "",
      snippet: detail.data.snippet || "",
    });
  }

  return JSON.stringify(messages, null, 2);
}

async function handleGmailRead({ message_id }) {
  const gmail = getGmail();
  const res = await gmail.users.messages.get({
    userId: "me",
    id: message_id,
    format: "full",
  });

  const headers = {};
  for (const h of res.data.payload?.headers || []) {
    headers[h.name] = h.value;
  }

  const body = extractEmailBody(res.data.payload);

  return JSON.stringify(
    {
      id: res.data.id,
      threadId: res.data.threadId,
      from: headers.From || "",
      to: headers.To || "",
      subject: headers.Subject || "",
      date: headers.Date || "",
      body,
    },
    null,
    2
  );
}

/**
 * Extract plain text (or fallback to HTML) from a Gmail message payload.
 */
function extractEmailBody(payload) {
  if (!payload) return "[No content]";

  // Direct plain text body
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString();
  }

  // Check parts recursively (multipart messages)
  for (const part of payload.parts || []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString();
    }
    if (part.parts) {
      const nested = extractEmailBody(part);
      if (nested !== "[No content]") return nested;
    }
  }

  // Fallback to HTML
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString();
  }
  for (const part of payload.parts || []) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString();
    }
  }

  return "[No readable body]";
}

async function handleGmailSend({ to, subject, body, reply_to_message_id }) {
  const gmail = getGmail();

  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
  ];

  let threadId;
  if (reply_to_message_id) {
    const original = await gmail.users.messages.get({
      userId: "me",
      id: reply_to_message_id,
      format: "metadata",
      metadataHeaders: ["Message-ID"],
    });
    threadId = original.data.threadId;
    const origMsgId = original.data.payload?.headers?.find(
      (h) => h.name === "Message-ID"
    )?.value;
    if (origMsgId) {
      lines.push(`In-Reply-To: ${origMsgId}`);
      lines.push(`References: ${origMsgId}`);
    }
  }

  const raw = Buffer.from(lines.join("\r\n") + "\r\n\r\n" + body).toString(
    "base64url"
  );

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(threadId ? { threadId } : {}),
    },
  });

  return JSON.stringify({
    id: res.data.id,
    threadId: res.data.threadId,
    status: "sent",
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const HANDLERS = {
  google_docs_search: handleDocsSearch,
  google_docs_read: handleDocsRead,
  gmail_search: handleGmailSearch,
  gmail_read: handleGmailRead,
  gmail_send: handleGmailSend,
};

/**
 * Returns tool definitions in Anthropic format.
 * Returns empty array if Google is not configured.
 */
export function getGoogleToolDefinitions() {
  if (!isGoogleConfigured()) return [];
  return TOOL_DEFINITIONS;
}

/**
 * Execute a Google tool by name.
 */
export async function callGoogleTool(name, args) {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`Unknown Google tool: ${name}`);
  return await handler(args);
}

/**
 * Check if a tool name belongs to a Google tool.
 */
export function isGoogleTool(name) {
  return name in HANDLERS;
}
