import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = new Hono();

const payload = z.object({
  name: z.string().min(1),
});

router.get("/", (c) => {
  const cats = db.select().from(schema.categories).orderBy(schema.categories.name).all();
  return c.json(cats);
});

router.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = payload.parse(body);
  const existing = db.select().from(schema.categories).where(eq(schema.categories.name, parsed.name)).get();
  if (existing) return c.json(existing, 200);
  const result = db.insert(schema.categories).values({ name: parsed.name }).returning().get();
  return c.json(result, 201);
});

router.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const parsed = payload.parse(body);
  const result = db.update(schema.categories).set({ name: parsed.name }).where(eq(schema.categories.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

router.delete("/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  db.delete(schema.categories).where(eq(schema.categories.id, id)).run();
  return c.json({ success: true });
});

export { router as categoriesRouter };
