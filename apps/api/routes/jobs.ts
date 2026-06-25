import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { killJobProcesses } from "../services/job-runner";
import { cleanStaleClone } from "../services/git-clone";

const router = new Hono();

// Get all active jobs (queued or running) for the workspace
router.get("/active", (c) => {
  const ctx = requireAuth(c);
  const jobs = db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.workspaceId, ctx.workspace.id),
        or(
          eq(schema.jobs.status, "queued"),
          eq(schema.jobs.status, "running"),
        ),
      ),
    )
    .orderBy(schema.jobs.createdAt)
    .all();
  return c.json(jobs);
});

// List all jobs for workspace, optional status filter
router.get("/", (c) => {
  const ctx = requireAuth(c);
  const status = c.req.query("status");

  const conditions = [eq(schema.jobs.workspaceId, ctx.workspace.id)];
  if (status) {
    const statuses = status.split(",").filter(s => ["queued", "running", "completed", "failed", "cancelled"].includes(s));
    if (statuses.length > 0) {
      conditions.push(inArray(schema.jobs.status, statuses as any));
    }
  }

  const jobs = db
    .select()
    .from(schema.jobs)
    .where(and(...conditions))
    .orderBy(schema.jobs.createdAt)
    .all();
  return c.json(jobs);
});

// Get single job
router.get("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const job = db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!job) return c.json({ error: "Not found" }, 404);

  const collection = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.workspaceId, ctx.workspace.id))
    .get();
  // Verify workspace ownership through the job's workspaceId
  if (job.workspaceId !== ctx.workspace.id) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(job);
});

// Cancel a queued or running job
router.post("/:id/cancel", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const job = db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.workspaceId !== ctx.workspace.id) return c.json({ error: "Not found" }, 404);
  if (job.status !== "queued" && job.status !== "running") return c.json({ error: "Only queued or running jobs can be cancelled" }, 400);

  // Kill any spawned git processes for this job BEFORE updating DB/disk
  killJobProcesses(id);

  // If this is a repo-related job, reset the repository cloneStatus
  let payload: any = {};
  try { payload = JSON.parse(job.payload || "{}"); } catch {}

  if (job.type === "clone_repository" || job.type === "refresh_repository") {
    const repoId = payload.repositoryId;
    if (repoId) {
      const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, repoId)).get();
      if (repo) {
        if (job.type === "clone_repository") {
          // Clean up any partial clone files from disk
          cleanStaleClone(ctx.workspace.id, repo.name);
          db.update(schema.repositories)
            .set({ cloneStatus: "failed", cloneError: "Cancelled by user", updatedAt: new Date().toISOString() })
            .where(eq(schema.repositories.id, repoId))
            .run();
        } else {
          db.update(schema.repositories)
            .set({
              cloneStatus: repo.cloneStatus === "syncing" ? "connected" : repo.cloneStatus,
              updatedAt: new Date().toISOString()
            })
            .where(eq(schema.repositories.id, repoId))
            .run();
        }
      }
    }
  }

  db.update(schema.jobs)
    .set({
      status: "cancelled",
      message: "Cancelled by user",
      error: null,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.jobs.id, id))
    .run();

  return c.json({ success: true });
});

// Delete a completed, failed, or cancelled job
router.delete("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const job = db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.workspaceId !== ctx.workspace.id) return c.json({ error: "Not found" }, 404);
  if (job.status === "queued" || job.status === "running") return c.json({ error: "Cancel the job first before deleting" }, 400);

  db.delete(schema.jobs).where(eq(schema.jobs.id, id)).run();
  return c.json({ success: true });
});

// Retry a failed job
router.post("/:id/retry", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const job = db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).get();
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.workspaceId !== ctx.workspace.id) return c.json({ error: "Not found" }, 404);
  if (job.status !== "failed") return c.json({ error: "Only failed jobs can be retried" }, 400);

  db.update(schema.jobs)
    .set({
      status: "queued",
      progress: 0,
      message: "Retrying...",
      error: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.jobs.id, id))
    .run();

  return c.json({ success: true });
});

export { router as jobsRouter };
