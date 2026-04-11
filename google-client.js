/**
 * google-client.js
 *
 * Creates authenticated Google API clients for Docs, Drive, and Gmail.
 * Uses a stored refresh token to auto-mint short-lived access tokens.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN   (from running google-oauth.js)
 */

import { google } from "googleapis";
import "dotenv/config";

let authClient = null;

/**
 * Returns true if Google credentials are configured.
 */
export function isGoogleConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

/**
 * Get or create the OAuth2 client with refresh token set.
 * Token refresh is handled automatically by the googleapis library.
 */
export function getAuth() {
  if (authClient) return authClient;

  if (!isGoogleConfigured()) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN in .env. " +
        "Run: node google-oauth.js"
    );
  }

  authClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  authClient.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return authClient;
}

export function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

export function getDocs() {
  return google.docs({ version: "v1", auth: getAuth() });
}

export function getGmail() {
  return google.gmail({ version: "v1", auth: getAuth() });
}
