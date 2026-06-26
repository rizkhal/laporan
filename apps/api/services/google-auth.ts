/**
 * Google Authentication helpers for the Google Docs export engine.
 *
 * Handles OAuth2 token refresh and provides an authenticated client
 * for the Google Docs API.
 */

import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

/**
 * Build the OAuth2 client and refresh tokens if needed.
 *
 * This function uses googleapis OAuth2 client which handles token refresh
 * transparently. The returned `freshAccessToken` should be used for raw
 * API calls (fetch), while the `oauthClient` should be used for googleapis
 * library calls.
 */
export async function getAuthenticatedClient(
  accessToken: string,
  refreshToken: string,
): Promise<{
  oauthClient: OAuth2Client;
  freshAccessToken: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
    );
  }

  const oauthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauthClient.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Try to refresh the token if expired.
  // getAccessToken() will auto-refresh if the token is expired.
  try {
    const credentials = await oauthClient.getAccessToken();
    // Use the refreshed token, or fall back to the current credentials,
    // or the original accessToken
    const creds = oauthClient.credentials;
    const actualToken = credentials?.token || creds?.access_token || accessToken;
    return {
      oauthClient,
      freshAccessToken: actualToken,
    };
  } catch {
    // If refresh fails, use the original token (will fail later with a clear error)
    const creds = oauthClient.credentials;
    return { oauthClient, freshAccessToken: creds?.access_token || accessToken };
  }
}

/**
 * Refresh an access token given a refresh token.
 * Returns the new access token or throws if refresh fails.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth not configured");
  }

  const oauthClient = new google.auth.OAuth2(clientId, clientSecret);
  oauthClient.setCredentials({
    refresh_token: refreshToken,
  });

  const credentials = await oauthClient.getAccessToken();
  return credentials.token || "";
}
