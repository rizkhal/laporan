import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = new Hono();

router.get("/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  const analysis = db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).get();
  if (!analysis) return c.json({ error: "Not found" }, 404);
  return c.json(analysis);
});

router.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const parsed = z.object({
    workItems: z.string().optional(),
    category: z.string().optional(),
    summary: z.string().optional(),
    impact: z.string().optional(),
    risks: z.string().optional(),
    nextSuggestions: z.string().optional(),
  }).parse(body);

  const updateData: any = { isEdited: true, updatedAt: new Date().toISOString() };
  if (parsed.workItems !== undefined) updateData.workItems = parsed.workItems;
  if (parsed.category !== undefined) updateData.category = parsed.category;
  if (parsed.summary !== undefined) updateData.summary = parsed.summary;
  if (parsed.impact !== undefined) updateData.impact = parsed.impact;
  if (parsed.risks !== undefined) updateData.risks = parsed.risks;
  if (parsed.nextSuggestions !== undefined) updateData.nextSuggestions = parsed.nextSuggestions;

  db.update(schema.analyses).set(updateData).where(eq(schema.analyses.id, id)).run();
  const analysis = db.select().from(schema.analyses).where(eq(schema.analyses.id, id)).get();
  return c.json(analysis);
});

// Get analyses for collection
router.get("/collection/:collectionId", (c) => {
  const collectionId = parseInt(c.req.param("collectionId"));
  const analyses = db.select().from(schema.analyses).where(eq(schema.analyses.collectionId, collectionId)).all();
  return c.json(analyses);
});

export { router as analysesRouter };
