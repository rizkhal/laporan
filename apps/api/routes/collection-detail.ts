import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, assertOwnership } from "../lib/auth";
import { createJob } from "../services/job-runner";

const router = new Hono();

// Collect commits for a collection — queues background jobs per repo
router.post("/:id/collect", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  // Update status to collecting
  db.update(schema.collections).set({ status: "collecting" }).where(eq(schema.collections.id, id)).run();

  // Determine which repos to collect: specific repoIds or all workspace-enabled
  const selectedRepoIds: number[] = collection.repoIds ? JSON.parse(collection.repoIds) : [];
  let repos: (typeof schema.repositories.$inferSelect)[];
  if (selectedRepoIds.length > 0) {
    repos = selectedRepoIds
      .map(rid => db.select().from(schema.repositories).where(and(eq(schema.repositories.id, rid), eq(schema.repositories.workspaceId, ctx.workspace.id))).get())
      .filter((repo): repo is typeof schema.repositories.$inferSelect => Boolean(repo));
  } else {
    repos = db.select().from(schema.repositories)
      .where(and(eq(schema.repositories.workspaceId, ctx.workspace.id), eq(schema.repositories.enabled, true as any)))
      .all();
  }

  // Queue a background job per repo
  const jobs: { repoId: number; repoName: string; jobId: number }[] = [];
  for (const repo of repos) {
    const job = createJob(ctx.workspace.id, "collect_commits", {
      repositoryId: repo.id,
      collectionId: id,
    });
    jobs.push({ repoId: repo.id, repoName: repo.name, jobId: job.id });
  }

  return c.json({ totalRepos: repos.length, jobs });
});

// Get commits for a collection
router.get("/:id/commits", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const repoId = c.req.query("repoId");

  if (repoId) {
    const commits = db.select().from(schema.commits)
      .where(and(eq(schema.commits.collectionId, id), eq(schema.commits.repoId, parseInt(repoId))))
      .all();
    return c.json(commits);
  }

  const data = db.select().from(schema.commits)
    .where(eq(schema.commits.collectionId, id))
    .orderBy(desc(schema.commits.date))
    .all();
  return c.json(data);
});

// Run LLM analysis for a collection — queues one background job per repo
router.post("/:id/analyze", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const body = await c.req.json().catch(() => ({}));
  const specificRepoId = body.repoId ? parseInt(body.repoId) : null;
  const llmProviderId = body.llmProviderId ? parseInt(body.llmProviderId) : undefined;

  db.update(schema.collections).set({ status: "analyzing" }).where(eq(schema.collections.id, id)).run();

  // Get repos to analyze (scoped to workspace)
  let repos;
  if (specificRepoId) {
    const repo = db.select().from(schema.repositories)
      .where(and(eq(schema.repositories.id, specificRepoId), eq(schema.repositories.workspaceId, ctx.workspace.id)))
      .get();
    repos = repo ? [repo] : [];
  } else {
    repos = db.select().from(schema.repositories)
      .where(eq(schema.repositories.workspaceId, ctx.workspace.id))
      .all();
  }

  // Queue a background job per repo
  const jobs: { repoId: number; repoName: string; jobId: number }[] = [];
  for (const repo of repos) {
    const payload: any = { repositoryId: repo.id, collectionId: id };
    if (llmProviderId) payload.llmProviderId = llmProviderId;

    const job = createJob(ctx.workspace.id, "analyze_collection", payload);
    jobs.push({ repoId: repo.id, repoName: repo.name, jobId: job.id });
  }

  return c.json({ totalRepos: repos.length, jobs });
});

// Generate report — queues a background job
router.post("/:id/generate-report", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const body = await c.req.json().catch(() => ({}));
  const style = body.style || "office";

  db.update(schema.collections).set({ status: "generating" }).where(eq(schema.collections.id, id)).run();

  const job = createJob(ctx.workspace.id, "generate_report", {
    collectionId: id,
    style,
  });

  return c.json({ success: true, jobId: job.id });
});

export { router as collectionDetailRouter };
