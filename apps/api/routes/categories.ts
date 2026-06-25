import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";

const router = new Hono();

const payload = z.object({
  name: z.string().min(1),
});

// List all categories scoped to workspace
router.get("/", (c) => {
  const ctx = requireAuth(c);
  const cats = db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.workspaceId, ctx.workspace.id))
    .orderBy(schema.categories.name)
    .all();
  return c.json(cats);
});

// Create category
router.post("/", async (c) => {
  const ctx = requireAuth(c);
  const body = await c.req.json();
  const parsed = payload.parse(body);

  // Check duplicate within workspace
  const existing = db.select().from(schema.categories)
    .where(and(eq(schema.categories.workspaceId, ctx.workspace.id), eq(schema.categories.name, parsed.name)))
    .get();
  if (existing) return c.json(existing, 200);

  const result = db.insert(schema.categories).values({
    workspaceId: ctx.workspace.id,
    name: parsed.name,
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
  const parsed = payload.parse(body);
  const result = db.update(schema.categories).set({ name: parsed.name }).where(eq(schema.categories.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Delete category
router.delete("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const cat = db.select().from(schema.categories).where(eq(schema.categories.id, id)).get();
  assertOwnership(cat, ctx.workspace.id, "Category");
  db.delete(schema.categories).where(eq(schema.categories.id, id)).run();
  return c.json({ success: true });
});

export { router as categoriesRouter };
