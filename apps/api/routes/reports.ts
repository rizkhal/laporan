import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { generateReport } from "../services/report-formatter";

const router = new Hono();

// Get report for a collection
router.get("/:collectionId", (c) => {
  const collectionId = parseInt(c.req.param("collectionId"));
  const report = db.select().from(schema.reports).where(eq(schema.reports.collectionId, collectionId)).get();
  if (!report) return c.json({ error: "Not found" }, 404);
  return c.json(report);
});

// Generate report for a collection
router.post("/:collectionId/generate", async (c) => {
  const collectionId = parseInt(c.req.param("collectionId"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, collectionId)).get();
  if (!collection) return c.json({ error: "Collection not found" }, 404);

  db.update(schema.collections).set({ status: "generating" }).where(eq(schema.collections.id, collectionId)).run();

  try {
    const content = await generateReport(collectionId);

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
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const parsed = z.object({ content: z.string() }).parse(body);

  db.update(schema.reports)
    .set({ content: parsed.content, isEdited: true, updatedAt: new Date().toISOString() })
    .where(eq(schema.reports.id, id))
    .run();

  const report = db.select().from(schema.reports).where(eq(schema.reports.id, id)).get();
  return c.json(report);
});

export { router as reportsRouter };
