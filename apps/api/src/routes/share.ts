import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { requireAuth, assertOwnership } from "../lib/auth";

const router = new Hono();

// ── Short-lived access tokens for protected links ──
// Map<token, { slug: string; expiresAt: number }>
const accessTokens = new Map<string, { slug: string; expiresAt: number }>();

function generateSlug(): string {
  return crypto.randomBytes(8).toString("hex");
}

function generateAccessToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of accessTokens) {
    if (data.expiresAt < now) accessTokens.delete(token);
  }
}, 5 * 60 * 1000);

// ── Create or update share link for a report ──
router.post("/:collectionId/share", async (c) => {
  const ctx = requireAuth(c);
  const collectionId = parseInt(c.req.param("collectionId"));

  // Verify collection ownership
  const collection = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  // Find the report for this collection
  const report = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.collectionId, collectionId))
    .get();
  if (!report) return c.json({ error: "No report found for this collection" }, 404);

  const body = await c.req.json();
  const parsed = z.object({
    visibility: z.enum(["public", "protected"]),
    password: z.string().min(1).max(256).optional(),
  }).parse(body);

  if (parsed.visibility === "protected" && !parsed.password) {
    return c.json({ error: "Password is required for protected visibility" }, 400);
  }

  // Check if share link already exists
  const existing = db
    .select()
    .from(schema.sharedReports)
    .where(eq(schema.sharedReports.reportId, report.id))
    .get();

  let passwordHash: string | null = null;
  if (parsed.password) {
    passwordHash = await bcrypt.hash(parsed.password, 10);
  }

  if (existing) {
    // Update existing share link
    db.update(schema.sharedReports)
      .set({
        visibility: parsed.visibility,
        passwordHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.sharedReports.id, existing.id))
      .run();
  } else {
    // Create new share link
    const slug = generateSlug();
    db.insert(schema.sharedReports)
      .values({
        reportId: report.id,
        slug,
        visibility: parsed.visibility,
        passwordHash,
      })
      .run();
  }

  const share = db
    .select()
    .from(schema.sharedReports)
    .where(eq(schema.sharedReports.reportId, report.id))
    .get();

  if (!share) return c.json({ error: "Failed to create share link" }, 500);

  return c.json({
    id: share.id,
    reportId: share.reportId,
    slug: share.slug,
    visibility: share.visibility,
    url: `/share/${share.slug}`,
  });
});

// ── Get share link info for a report ──
router.get("/:collectionId/share", (c) => {
  const ctx = requireAuth(c);
  const collectionId = parseInt(c.req.param("collectionId"));

  const collection = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const report = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.collectionId, collectionId))
    .get();
  if (!report) return c.json(null);

  const share = db
    .select()
    .from(schema.sharedReports)
    .where(eq(schema.sharedReports.reportId, report.id))
    .get();

  if (!share) return c.json(null);

  return c.json({
    id: share.id,
    reportId: share.reportId,
    slug: share.slug,
    visibility: share.visibility,
    createdAt: share.createdAt,
    url: `/share/${share.slug}`,
  });
});

// ── Delete share link ──
router.delete("/:collectionId/share", (c) => {
  const ctx = requireAuth(c);
  const collectionId = parseInt(c.req.param("collectionId"));

  const collection = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const report = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.collectionId, collectionId))
    .get();
  if (!report) return c.json({ error: "Report not found" }, 404);

  db.delete(schema.sharedReports)
    .where(eq(schema.sharedReports.reportId, report.id))
    .run();

  return c.json({ success: true });
});

// ── Public: verify password for protected links ──
router.post("/:slug/verify", async (c) => {
  const slug = c.req.param("slug");

  const share = db
    .select()
    .from(schema.sharedReports)
    .where(eq(schema.sharedReports.slug, slug))
    .get();
  if (!share) return c.json({ error: "Share link not found" }, 404);

  if (share.visibility !== "protected") {
    return c.json({ error: "This share link is not protected" }, 400);
  }

  const body = await c.req.json();
  const parsed = z.object({ password: z.string() }).parse(body);

  if (!share.passwordHash) {
    return c.json({ error: "No password configured" }, 500);
  }

  const valid = await bcrypt.compare(parsed.password, share.passwordHash);
  if (!valid) return c.json({ error: "Invalid password" }, 403);

  // Generate short-lived access token (1 hour)
  const accessToken = generateAccessToken();
  accessTokens.set(accessToken, {
    slug,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });

  return c.json({ accessToken });
});

// ── Public: get report markdown (NO auth) ──
router.get("/:slug", (c) => {
  const slug = c.req.param("slug");

  const share = db
    .select()
    .from(schema.sharedReports)
    .where(eq(schema.sharedReports.slug, slug))
    .get();
  if (!share) return c.json({ error: "Share link not found" }, 404);

  // For protected links, require valid access token
  if (share.visibility === "protected") {
    const token = c.req.query("token");
    if (!token) return c.json({ error: "This report is password protected", protected: true }, 401);

    const tokenData = accessTokens.get(token);
    if (!tokenData || tokenData.slug !== slug || tokenData.expiresAt < Date.now()) {
      accessTokens.delete(token);
      return c.json({ error: "Invalid or expired access token", protected: true }, 401);
    }
  }

  const report = db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.id, share.reportId))
    .get();
  if (!report) return c.json({ error: "Report not found" }, 404);

  return c.json({
    title: report.title,
    content: report.content,
    visibility: share.visibility,
  });
});

export { router as shareRouter };
