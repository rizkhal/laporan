import { existsSync, rmSync } from "fs";
import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";
import { testRepoConnection } from "../services/git-ssh";
import { resolveRepoPath, cleanStaleClone } from "../services/git-clone";
import { createJob, killJobProcesses } from "../services/job-runner";

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

// Create repo — saves immediately, clones asynchronously in background
router.post("/", async (c) => {
  const ctx = requireAuth(c);
  const body = await c.req.json();
  const parsed = repoPayload.parse(body);

  const localPath = resolveRepoPath(ctx.workspace.id, parsed.name);

  // Clean up any stale/orphaned clone directory from a previous failed delete
  // This prevents orphaned .git directories from causing false "already cloned" results
  cleanStaleClone(ctx.workspace.id, parsed.name);

  // Save repo immediately with pending_clone status
  const result = db.insert(schema.repositories).values({
    workspaceId: ctx.workspace.id,
    name: parsed.name,
    localPath,
    remoteUrl: parsed.remoteUrl,
    enabled: parsed.enabled,
    authorNames: JSON.stringify(parsed.authorNames),
    authorEmails: JSON.stringify(parsed.authorEmails),
    cloneStatus: "pending_clone",
  }).returning().get();

  // Queue background clone job
  createJob(ctx.workspace.id, "clone_repository", {
    repositoryId: result.id,
  });

  return c.json(result, 201);
});

// Update repo — queues re-clone if remote URL or name changed
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
    if (parsed.name !== repo.name) {
      const newLocalPath = resolveRepoPath(ctx.workspace.id, parsed.name);
      updateData.localPath = newLocalPath;
      // Queue re-clone
      db.update(schema.repositories)
        .set({ cloneStatus: "pending_clone", cloneError: null })
        .where(eq(schema.repositories.id, id))
        .run();
      createJob(ctx.workspace.id, "clone_repository", { repositoryId: id });
    }
  }
  if (parsed.remoteUrl !== undefined) {
    updateData.remoteUrl = parsed.remoteUrl;
    // Queue re-clone on URL change
    db.update(schema.repositories)
      .set({ cloneStatus: "pending_clone", cloneError: null })
      .where(eq(schema.repositories.id, id))
      .run();
    createJob(ctx.workspace.id, "clone_repository", { repositoryId: id });
  }
  if (parsed.enabled !== undefined) updateData.enabled = parsed.enabled;
  if (parsed.authorNames !== undefined) updateData.authorNames = JSON.stringify(parsed.authorNames);
  if (parsed.authorEmails !== undefined) updateData.authorEmails = JSON.stringify(parsed.authorEmails);

  const result = db.update(schema.repositories).set(updateData).where(eq(schema.repositories.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

// Delete repo — cascades to commits, analyses, jobs, and files on disk
router.delete("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  // 0. Kill any spawned git processes for queued/running jobs first
  const activeJobs = db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.workspaceId, ctx.workspace.id),
        or(eq(schema.jobs.status, "queued"), eq(schema.jobs.status, "running")),
      ),
    )
    .all();

  const jobIdsToKill = activeJobs
    .filter((j) => {
      try {
        const p = JSON.parse(j.payload || "{}");
        return p.repositoryId === id;
      } catch {
        return false;
      }
    })
    .map((j) => j.id);

  // Kill spawned processes BEFORE removing files
  for (const jid of jobIdsToKill) {
    killJobProcesses(jid);
  }

  // 1. Cancel any queued/running jobs for this repo
  if (jobIdsToKill.length > 0) {
    db.update(schema.jobs)
      .set({
        status: "cancelled",
        message: "Repository deleted",
        error: "Repository was deleted while job was queued/running",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(inArray(schema.jobs.id, jobIdsToKill))
      .run();
  }

  // 2. Delete analyses for this repo
  db.delete(schema.analyses).where(eq(schema.analyses.repoId, id)).run();

  // 3. Delete commits for this repo
  db.delete(schema.commits).where(eq(schema.commits.repoId, id)).run();

  // 4. Delete cloned files from disk
  // Kill spawned processes first (already done above), then remove files
  // Use spawnSync rm -rf as the primary method for reliability
  try {
    if (existsSync(repo.localPath)) {
      rmSync(repo.localPath, { recursive: true, force: true });
    }
  } catch {}

  // Fallback: retry with spawnSync if rmSync didn't work
  if (existsSync(repo.localPath)) {
    try {
      const { spawnSync } = require("child_process");
      spawnSync("rm", ["-rf", repo.localPath], { timeout: 30000 });
    } catch {}
  }

  // 5. Delete the repo record itself
  db.delete(schema.repositories).where(eq(schema.repositories.id, id)).run();

  return c.json({ success: true });
});

// Refresh (git pull) repository — async via background job
router.post("/:id/refresh", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  if (repo.cloneStatus !== "connected") {
    return c.json({ success: false, message: "Repository is not connected. Wait for cloning to complete." });
  }

  // Queue background refresh job
  db.update(schema.repositories)
    .set({ cloneStatus: "syncing", updatedAt: new Date().toISOString() })
    .where(eq(schema.repositories.id, id))
    .run();

  createJob(ctx.workspace.id, "refresh_repository", { repositoryId: id });

  return c.json({ success: true, message: "Refresh queued." });
});

// Retry clone for a failed repository
router.post("/:id/retry-clone", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  db.update(schema.repositories)
    .set({ cloneStatus: "pending_clone", cloneError: null, updatedAt: new Date().toISOString() })
    .where(eq(schema.repositories.id, id))
    .run();

  createJob(ctx.workspace.id, "clone_repository", { repositoryId: id });

  return c.json({ success: true, message: "Clone retry queued." });
});

// Test repository connection using workspace SSH key (uses remoteUrl)
router.post("/:id/test-connection", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, id)).get();
  assertOwnership(repo, ctx.workspace.id, "Repository");

  const result = await testRepoConnection(ctx.workspace.id, repo.remoteUrl);
  return c.json(result);
});

export { router as reposRouter };
