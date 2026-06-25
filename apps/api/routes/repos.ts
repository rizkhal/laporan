import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";

const router = new Hono();

const repoPayload = z.object({
  name: z.string().min(1),
  localPath: z.string().min(1),
  category: z.string().optional().default("general"),
  enabled: z.boolean().optional().default(true),
  authorNames: z.array(z.string()).optional().default([]),
  authorEmails: z.array(z.string()).optional().default([]),
});

// List all repos scoped to workspace
router.get("/", (c) => {
  const ctx = requireAuth(c);
  const repos = db
    .select()
    .from(schema.repositories)
    .where(eq(schema.repositories.workspaceId, ctx.workspace.id))
    .all();
  return c.json(repos);
});

// Create repo
router.post("/", async (c) => {
  const ctx = requireAuth(c);
  const body = await c.req.json();
  const parsed = repoPayload.parse(body);
  const result = db.insert(schema.repositories).values({
    workspaceId: ctx.workspace.id,
    name: parsed.name,
    localPath: parsed.localPath,
    category: parsed.category,
    enabled: parsed.enabled,
    authorNames: JSON.stringify(parsed.authorNames),
    authorEmails: JSON.stringify(parsed.authorEmails),
  }).returning().get();
  return c.json(result, 201);
});

// Update repo
router.put("/:id", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  const body = await c.req.json();
  const parsed = repoPayload.partial().parse(body);
  const updateData: any = { updatedAt: new Date().toISOString() };
  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.localPath !== undefined) updateData.localPath = parsed.localPath;
  if (parsed.category !== undefined) updateData.category = parsed.category;
  if (parsed.enabled !== undefined) updateData.enabled = parsed.enabled;
  if (parsed.authorNames !== undefined) updateData.authorNames = JSON.stringify(parsed.authorNames);
  if (parsed.authorEmails !== undefined) updateData.authorEmails = JSON.stringify(parsed.authorEmails);

  const result = db.update(schema.repositories).set(updateData).where(eq(schema.repositories.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Delete repo
router.delete("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  db.delete(schema.repositories).where(eq(schema.repositories.id, id)).run();
  return c.json({ success: true });
});

export { router as reposRouter };
