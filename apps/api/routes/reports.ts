import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";
import { generateReport } from "../services/report-formatter";

const router = new Hono();

// Get report for a collection
router.get("/:collectionId", (c) => {
  const ctx = requireAuth(c);
  const collectionId = parseInt(c.req.param("collectionId"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, collectionId)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const report = db.select().from(schema.reports).where(eq(schema.reports.collectionId, collectionId)).get();
  if (!report) return c.json({ error: "Not found" }, 404);
  return c.json(report);
});

// Generate report for a collection
router.post("/:collectionId/generate", async (c) => {
  const ctx = requireAuth(c);
  const collectionId = parseInt(c.req.param("collectionId"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, collectionId)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  db.update(schema.collections).set({ status: "generating" }).where(eq(schema.collections.id, collectionId)).run();

  try {
    const content = await generateReport(collectionId, ctx.workspace.id);

    // Upsert report
    const existing = db.select().from(schema.reports).where(eq(schema.reports.collectionId, collectionId)).get();

    if (existing) {
      db.update(schema.reports)
        .set({ content, title: collection.title, updatedAt: new Date().toISOString() })
        .where(eq(schema.reports.id, existing.id))
        .run();
    } else {
      db.insert(schema.reports).values({
        collectionId,
        title: collection.title,
        content,
      }).run();
    }

    db.update(schema.collections).set({ status: "generated" }).where(eq(schema.collections.id, collectionId)).run();

    const report = db.select().from(schema.reports).where(eq(schema.reports.collectionId, collectionId)).get();
    return c.json(report);
  } catch (err: any) {
    db.update(schema.collections).set({ status: "analyzed" }).where(eq(schema.collections.id, collectionId)).run();
    return c.json({ error: err.message }, 500);
  }
});

// Update report
router.put("/:id", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const report = db.select().from(schema.reports).where(eq(schema.reports.id, id)).get();
  if (!report) return c.json({ error: "Not found" }, 404);

  // Verify ownership through collection
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, report.collectionId)).get();
  assertOwnership(collection, ctx.workspace.id, "Report");

  const body = await c.req.json();
  const parsed = z.object({ content: z.string() }).parse(body);

  db.update(schema.reports)
    .set({ content: parsed.content, isEdited: true, updatedAt: new Date().toISOString() })
    .where(eq(schema.reports.id, id))
    .run();

  const updated = db.select().from(schema.reports).where(eq(schema.reports.id, id)).get();
  return c.json(updated);
});

export { router as reportsRouter };
