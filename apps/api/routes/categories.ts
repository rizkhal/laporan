import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";

const router = new Hono();

const categoryPayload = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex color (e.g., #6366f1)").optional().default("#6366f1"),
});

// List all categories for workspace
router.get("/", (c) => {
  const ctx = requireAuth(c);
  const cats = db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.workspaceId, ctx.workspace.id))
    .orderBy(desc(schema.categories.createdAt))
    .all();
  return c.json(cats);
});

// Create category
router.post("/", async (c) => {
  const ctx = requireAuth(c);
  const body = await c.req.json();
  const parsed = categoryPayload.parse(body);

  const result = db.insert(schema.categories).values({
    workspaceId: ctx.workspace.id,
    name: parsed.name,
    color: parsed.color,
  }).returning().get();

  return c.json(result, 201);
});

// Update category
router.put("/:id", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const cat = db.select().from(schema.categories).where(eq(schema.categories.id, id)).get();
  assertOwnership(cat, ctx.workspace.id, "Category");

  const body = await c.req.json();
  const parsed = categoryPayload.partial().parse(body);
  const updateData: any = { updatedAt: new Date().toISOString() };

  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.color !== undefined) updateData.color = parsed.color;

  const result = db.update(schema.categories).set(updateData).where(eq(schema.categories.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);

  return c.json(result);
});

// Delete category — sets categoryId = null on collections
router.delete("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const cat = db.select().from(schema.categories).where(eq(schema.categories.id, id)).get();
  assertOwnership(cat, ctx.workspace.id, "Category");

  // Unlink collections first
  db.update(schema.collections)
    .set({ categoryId: null, updatedAt: new Date().toISOString() })
    .where(eq(schema.collections.categoryId, id))
    .run();

  db.delete(schema.categories).where(eq(schema.categories.id, id)).run();
  return c.json({ success: true });
});

export { router as categoriesRouter };
