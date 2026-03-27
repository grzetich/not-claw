/**
 * oauth.js
 *
 * One-time OAuth flow to get a Notion access token for the MCP server.
 * Run: node oauth.js
 *
 * 1. Opens your browser to Notion's authorization page
 * 2. Notion redirects to localhost:3333/callback with a code
 * 3. Exchanges the code for an access token
 * 4. Prints the token — add it to .env as NOTION_MCP_TOKEN
 */

import "dotenv/config";
import { createServer } from "http";
import { URL } from "url";

const CLIENT_ID = process.env.NOTION_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.NOTION_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3333/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing NOTION_OAUTH_CLIENT_ID or NOTION_OAUTH_CLIENT_SECRET in .env");
  process.exit(1);
}

const authUrl =
  `https://api.notion.com/v1/oauth/authorize?owner=user` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code`;

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl);
console.log("\nWaiting for callback...\n");

// Try to open browser automatically
import("child_process").then(({ exec }) => {
  exec(`start "" "${authUrl}"`);
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3333");

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Error</h1><p>${error}</p>`);
    console.error("OAuth error:", error);
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h1>Error</h1><p>No code received</p>");
    return;
  }

  console.log("Received authorization code. Exchanging for token...");

  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      throw new Error(JSON.stringify(data));
    }

    console.log("\n✅ Success!\n");
    console.log("Access token:", data.access_token);
    console.log("Workspace:", data.workspace_name);
    console.log("Bot ID:", data.bot_id);
    console.log("\nAdd this to your .env:\n");
    console.log(`NOTION_MCP_TOKEN=${data.access_token}`);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h1>✅ Success!</h1><p>Got your Notion token. You can close this tab.</p>"
    );
  } catch (err) {
    console.error("Token exchange failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>Error</h1><p>${err.message}</p>`);
  }

  setTimeout(() => process.exit(0), 1000);
});

server.listen(3333, () => {
  console.log("Listening on http://localhost:3333");
});
