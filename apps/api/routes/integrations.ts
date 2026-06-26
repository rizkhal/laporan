import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { google } from "googleapis";

// Timeout helper for fetch calls
async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

const router = new Hono();

// ── OAuth2 Client ──

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ── Google Auth URL ──

router.get("/google/auth-url", (c) => {
  const ctx = requireAuth(c);

  const oauth2Client = getOAuth2Client();
  const scopes = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
  ];

  // Store workspace ID in state so we can retrieve it after OAuth callback
  const state = String(ctx.workspace.id);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
  });

  return c.json({ authUrl });
});

// ── Google OAuth Callback ──

router.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.json({ error: "Missing code or state parameter" }, 400);
  }

  const workspaceId = parseInt(state);
  if (isNaN(workspaceId)) {
    return c.json({ error: "Invalid state parameter" }, 400);
  }

  try {
    const oauth2Client = getOAuth2Client();
    console.log("🔑 Exchanging authorization code for tokens...");
    const { tokens } = await oauth2Client.getToken(code);
    console.log("✅ Tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    });

    if (!tokens.access_token) {
      return c.json({ error: "Failed to obtain access token." }, 400);
    }

    // Set credentials on the OAuth2 client for subsequent API calls
    oauth2Client.setCredentials(tokens);

    // Get user email via the userinfo API (direct fetch instead of library's getTokenInfo)
    let email = "connected@google.com";
    try {
      const userInfoRes = await fetchWithTimeout(
        `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokens.access_token}`
      );
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json() as { email?: string };
        if (userInfo.email) email = userInfo.email;
      }
    } catch (emailErr) {
      // Fallback: use placeholder if email retrieval fails
      console.warn("Failed to retrieve Google user email:", (emailErr as Error).message);
    }

    // Upsert the integration record
    const existing = db
      .select()
      .from(schema.googleIntegrations)
      .where(eq(schema.googleIntegrations.workspaceId, workspaceId))
      .get();

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null;

    if (existing) {
      db.update(schema.googleIntegrations)
        .set({
          googleAccountEmail: email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.googleIntegrations.id, existing.id))
        .run();
    } else {
      db.insert(schema.googleIntegrations)
        .values({
          workspaceId,
          googleAccountEmail: email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
        })
        .run();
    }

    // Redirect back to the frontend
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return c.redirect(`${frontendUrl}/settings?tab=integrations&google=connected`);
  } catch (err: any) {
    console.error("Google OAuth callback error:", err.message);
    return c.json({ error: "Failed to complete Google OAuth: " + err.message }, 500);
  }
});

// ── Google Connection Status ──

router.get("/google/status", (c) => {
  const ctx = requireAuth(c);

  const integration = db
    .select()
    .from(schema.googleIntegrations)
    .where(eq(schema.googleIntegrations.workspaceId, ctx.workspace.id))
    .get();

  if (!integration) {
    return c.json({ connected: false });
  }

  return c.json({
    connected: true,
    email: integration.googleAccountEmail,
    expiresAt: integration.expiresAt,
  });
});

// ── Disconnect Google ──

router.post("/google/disconnect", (c) => {
  const ctx = requireAuth(c);

  const existing = db
    .select()
    .from(schema.googleIntegrations)
    .where(eq(schema.googleIntegrations.workspaceId, ctx.workspace.id))
    .get();

  if (!existing) {
    return c.json({ message: "Already disconnected" });
  }

  db.delete(schema.googleIntegrations)
    .where(eq(schema.googleIntegrations.workspaceId, ctx.workspace.id))
    .run();

  return c.json({ message: "Google account disconnected" });
});

export { router as integrationsRouter };
