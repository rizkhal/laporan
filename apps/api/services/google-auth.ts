/**
 * Google Authentication helpers for the Google Docs export engine.
 *
 * Handles OAuth2 token refresh and provides an authenticated client
 * for the Google Docs API.
 */

import { google } from "googleapis";

/**
 * Build the OAuth2 client and refresh tokens if needed.
 */
export async function getAuthenticatedClient(
  accessToken: string,
  refreshToken: string,
): Promise<{
  oauthClient: any;
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

  // Try to refresh the token if expired
  try {
    const credentials = await oauthClient.getAccessToken();
    return {
      oauthClient,
      freshAccessToken: credentials.token || accessToken,
    };
  } catch {
    // If refresh fails, use the original token (will fail later with a clear error)
    return { oauthClient, freshAccessToken: accessToken };
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
