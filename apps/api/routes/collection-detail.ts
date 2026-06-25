import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { collectRepoForCollection } from "../services/git-collector";
import { runAnalysisForRepo } from "../services/llm-analyzer";

const router = new Hono();

// Collect commits for a collection
router.post("/:id/collect", async (c) => {
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  if (!collection) return c.json({ error: "Not found" }, 404);

  // Update status
  db.update(schema.collections).set({ status: "collecting" }).where(eq(schema.collections.id, id)).run();

  // Determine which repos to collect: specific repoIds or all enabled
  const selectedRepoIds: number[] = collection.repoIds ? JSON.parse(collection.repoIds) : [];
  let repos;
  if (selectedRepoIds.length > 0) {
    repos = selectedRepoIds.map(rid => db.select().from(schema.repositories).where(eq(schema.repositories.id, rid)).get()).filter(Boolean);
  } else {
    repos = db.select().from(schema.repositories).where(eq(schema.repositories.enabled, true as any)).all();
  }

  const results: { repoId: number; repoName: string; commits: number; error?: string }[] = [];
  let totalCommits = 0;
  let hasError = false;

  for (const repo of repos) {
    try {
      const count = await collectRepoForCollection(repo.id, id);
      results.push({ repoId: repo.id, repoName: repo.name, commits: count });
      totalCommits += count;
    } catch (err: any) {
      results.push({ repoId: repo.id, repoName: repo.name, commits: 0, error: err.message });
      hasError = true;
    }
  }

  db.update(schema.collections)
    .set({ status: hasError ? "completed" : "completed" })
    .where(eq(schema.collections.id, id))
    .run();

  return c.json({ totalCommits, results });
});

// Get commits for a collection
router.get("/:id/commits", (c) => {
  const id = parseInt(c.req.param("id"));
  const repoId = c.req.query("repoId");

  let query = db.select().from(schema.commits).where(eq(schema.commits.collectionId, id));

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

// Run LLM analysis for a collection (one repo at a time)
router.post("/:id/analyze", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const specificRepoId = body.repoId ? parseInt(body.repoId) : null;
  const llmProviderId = body.llmProviderId ? parseInt(body.llmProviderId) : undefined;

  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  if (!collection) return c.json({ error: "Not found" }, 404);

  db.update(schema.collections).set({ status: "analyzing" }).where(eq(schema.collections.id, id)).run();

  // Get repos to analyze
  let repos;
  if (specificRepoId) {
    const repo = db.select().from(schema.repositories).where(eq(schema.repositories.id, specificRepoId)).get();
    repos = repo ? [repo] : [];
  } else {
    repos = db.select().from(schema.repositories).all();
  }

  const results: { repoId: number; repoName: string; status: string; error?: string }[] = [];
  let hasError = false;

  for (const repo of repos) {
    try {
      await runAnalysisForRepo(id, repo.id, llmProviderId);
      results.push({ repoId: repo.id, repoName: repo.name, status: "completed" });
    } catch (err: any) {
      results.push({ repoId: repo.id, repoName: repo.name, status: "failed", error: err.message });
      hasError = true;
    }
  }

  db.update(schema.collections)
    .set({ status: hasError ? "analyzed" : "analyzed" })
    .where(eq(schema.collections.id, id))
    .run();

  return c.json({ results });
});

export { router as collectionDetailRouter };
