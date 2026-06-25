import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = new Hono();

const repoPayload = z.object({
  name: z.string().min(1),
  localPath: z.string().min(1),
  category: z.string().optional().default("general"),
  enabled: z.boolean().optional().default(true),
  authorNames: z.array(z.string()).optional().default([]),
  authorEmails: z.array(z.string()).optional().default([]),
});

router.get("/", (c) => {
  const repos = db.select().from(schema.repositories).all();
  return c.json(repos);
});

router.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = repoPayload.parse(body);
  const result = db.insert(schema.repositories).values({
    name: parsed.name,
    localPath: parsed.localPath,
    category: parsed.category,
    enabled: parsed.enabled,
    authorNames: JSON.stringify(parsed.authorNames),
    authorEmails: JSON.stringify(parsed.authorEmails),
  }).returning().get();
  return c.json(result, 201);
});

router.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json();
  const parsed = repoPayload.partial().parse(body);
  const updateData: any = {};
  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.localPath !== undefined) updateData.localPath = parsed.localPath;
  if (parsed.category !== undefined) updateData.category = parsed.category;
  if (parsed.enabled !== undefined) updateData.enabled = parsed.enabled;
  if (parsed.authorNames !== undefined) updateData.authorNames = JSON.stringify(parsed.authorNames);
  if (parsed.authorEmails !== undefined) updateData.authorEmails = JSON.stringify(parsed.authorEmails);
  updateData.updatedAt = new Date().toISOString();

  const result = db.update(schema.repositories).set(updateData).where(eq(schema.repositories.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

router.delete("/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  db.delete(schema.repositories).where(eq(schema.repositories.id, id)).run();
  return c.json({ success: true });
});

export { router as reposRouter };
