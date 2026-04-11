/**
 * google-oauth.js
 *
 * One-time OAuth flow to get a Google refresh token for Docs + Gmail access.
 * Run: node google-oauth.js
 *
 * Prerequisites:
 *   1. Create a Google Cloud project at https://console.cloud.google.com
 *   2. Enable the Google Docs API, Google Drive API, and Gmail API
 *   3. Create OAuth 2.0 credentials (Desktop or Web app)
 *   4. Add http://localhost:3334/callback as an authorized redirect URI
 *   5. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 *
 * After running, add the printed GOOGLE_REFRESH_TOKEN to your .env file.
 */

import "dotenv/config";
import { createServer } from "http";
import { URL } from "url";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3334/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env\n\n" +
      "To set up:\n" +
      "1. Go to https://console.cloud.google.com\n" +
      "2. Create a project and enable Docs, Drive, and Gmail APIs\n" +
      "3. Create OAuth 2.0 credentials\n" +
      "4. Add http://localhost:3334/callback as a redirect URI\n" +
      "5. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env"
  );
  process.exit(1);
}

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES.join(" "))}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl);
console.log("\nWaiting for callback...\n");

// Try to open browser automatically
import("child_process").then(({ exec }) => {
  const cmd =
    process.platform === "darwin"
      ? `open "${authUrl}"`
      : process.platform === "win32"
        ? `start "" "${authUrl}"`
        : `xdg-open "${authUrl}"`;
  exec(cmd);
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3334");

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

  console.log("Received authorization code. Exchanging for tokens...");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      throw new Error(JSON.stringify(data));
    }

    console.log("\n✅ Success!\n");
    console.log("Access token:", data.access_token?.slice(0, 20) + "...");
    console.log("Refresh token:", data.refresh_token ? "received" : "MISSING");
    console.log("Scopes:", data.scope);
    console.log("\nAdd this to your .env:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      "<h1>✅ Success!</h1><p>Got your Google tokens. You can close this tab.</p>"
    );
  } catch (err) {
    console.error("Token exchange failed:", err.message);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>Error</h1><p>${err.message}</p>`);
  }

  setTimeout(() => process.exit(0), 1000);
});

server.listen(3334, () => {
  console.log("Listening on http://localhost:3334");
});
