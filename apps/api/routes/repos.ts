import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";
import { testRepoConnection } from "../services/ssh-key";
import { cloneRepo, ensureRepoCloned, pullRepo, resolveRepoPath } from "../services/git-clone";

const router = new Hono();

const repoPayload = z.object({
  name: z.string().min(1),
  remoteUrl: z.string().min(1),
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

// Create repo — clones the repo automatically
router.post("/", async (c) => {
  const ctx = requireAuth(c);
  const body = await c.req.json();
  const parsed = repoPayload.parse(body);

  // Clone the repository using workspace SSH key
  const localPath = resolveRepoPath(ctx.workspace.id, parsed.name);
  const cloneResult = cloneRepo(ctx.workspace.id, parsed.remoteUrl, parsed.name);
  if (!cloneResult.success) {
    return c.json({ error: cloneResult.message }, 400);
  }

  const result = db.insert(schema.repositories).values({
    workspaceId: ctx.workspace.id,
    name: parsed.name,
    localPath,
    remoteUrl: parsed.remoteUrl,
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
  if (parsed.name !== undefined) {
    updateData.name = parsed.name;
    // Re-clone if name changed (new local path)
    if (parsed.name !== repo.name) {
      const newLocalPath = resolveRepoPath(ctx.workspace.id, parsed.name);
      const cloneResult = cloneRepo(ctx.workspace.id, repo.remoteUrl, parsed.name);
      if (!cloneResult.success) {
        return c.json({ error: cloneResult.message }, 400);
      }
      updateData.localPath = newLocalPath;
    }
  }
  if (parsed.remoteUrl !== undefined) {
    updateData.remoteUrl = parsed.remoteUrl;
    // Re-clone on URL change
    const cloneResult = cloneRepo(ctx.workspace.id, parsed.remoteUrl, parsed.name || repo.name);
    if (!cloneResult.success) {
      return c.json({ error: cloneResult.message }, 400);
    }
    updateData.localPath = resolveRepoPath(ctx.workspace.id, parsed.name || repo.name);
  }
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

// Refresh (git pull) repository
router.post("/:id/refresh", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  const result = pullRepo(ctx.workspace.id, repo.localPath);
  return c.json(result);
});

// Test repository connection using workspace SSH key (uses remoteUrl)
router.post("/:id/test-connection", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  const result = testRepoConnection(ctx.workspace.id, repo.remoteUrl);
  return c.json(result);
});

export { router as reposRouter };
