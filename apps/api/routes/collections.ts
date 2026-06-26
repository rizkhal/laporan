import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, desc, asc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";

const router = new Hono();

function enrichCollection(col: any) {
  const enriched: any = {
    ...col,
    repoIds: col.repoIds ? JSON.parse(col.repoIds) : null,
  };
  // Fetch category info if categoryId is set
  if (col.categoryId) {
    const cat = db.select().from(schema.categories).where(eq(schema.categories.id, col.categoryId)).get();
    if (cat) {
      enriched.category = { id: cat.id, name: cat.name, color: cat.color };
    }
  }
  return enriched;
}

// List all collections scoped to workspace
router.get("/", (c) => {
  const ctx = requireAuth(c);
  const collections = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.workspaceId, ctx.workspace.id))
    .orderBy(desc(schema.collections.year), asc(schema.collections.month))
    .all();
  return c.json(collections.map(enrichCollection));
});

// Create collection
router.post("/", async (c) => {
  const ctx = requireAuth(c);
  const body = await c.req.json();
  const parsed = z.object({ year: z.number(), month: z.number(), repoIds: z.array(z.number()).optional(), categoryId: z.number().nullable().optional() }).parse(body);

  const title = `${new Date(parsed.year, parsed.month - 1).toLocaleString("default", { month: "long" })} ${parsed.year}`;

  const result = db.insert(schema.collections).values({
    workspaceId: ctx.workspace.id,
    year: parsed.year,
    month: parsed.month,
    title,
    repoIds: parsed.repoIds ? JSON.stringify(parsed.repoIds) : null,
    categoryId: parsed.categoryId ?? null,
  }).returning().get();

  return c.json(enrichCollection(result), 201);
});

// Get single collection
router.get("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");
  return c.json(enrichCollection(collection));
});

// Update collection (e.g., repo selection)
router.put("/:id", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const body = await c.req.json();
  const parsed = z.object({ repoIds: z.array(z.number()).nullable().optional(), categoryId: z.number().nullable().optional() }).parse(body);

  const updateData: any = { updatedAt: new Date().toISOString() };
  if (parsed.repoIds !== undefined) {
    updateData.repoIds = parsed.repoIds === null ? null : JSON.stringify(parsed.repoIds);
  }
  if (parsed.categoryId !== undefined) {
    updateData.categoryId = parsed.categoryId;
  }

  const result = db.update(schema.collections).set(updateData).where(eq(schema.collections.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);

  return c.json(enrichCollection(result));
});

// Delete collection
router.delete("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");
  db.delete(schema.collections).where(eq(schema.collections.id, id)).run();
  return c.json({ success: true });
});

// Get collection stats
router.get("/:id/stats", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const commits = db.select().from(schema.commits).where(eq(schema.commits.collectionId, id)).all();
  const analyses = db.select().from(schema.analyses).where(eq(schema.analyses.collectionId, id)).all();

  const repoIds = [...new Set(commits.map(c => c.repoId))];
  const repos = repoIds
    .map(rid => db.select().from(schema.repositories)
      .where(and(eq(schema.repositories.id, rid), eq(schema.repositories.workspaceId, ctx.workspace.id)))
      .get())
    .filter(Boolean);

  const totalCommits = commits.length;
  const totalFiles = commits.reduce((s, c) => s + c.filesChanged, 0);
  const totalInsertions = commits.reduce((s, c) => s + c.insertions, 0);
  const totalDeletions = commits.reduce((s, c) => s + c.deletions, 0);
  const uniqueAuthors = [...new Set(commits.map(c => c.authorName))];
  const analyzedCount = analyses.filter(a => a.status === "completed").length;
  const failedCount = analyses.filter(a => a.status === "failed").length;

  return c.json({
    totalRepos: repos.length,
    totalCommits,
    totalFiles,
    totalInsertions,
    totalDeletions,
    uniqueAuthors: uniqueAuthors.length,
    analyzedCount,
    failedCount,
    totalAnalyses: analyses.length,
  });
});

// Get per-repo stats for a collection
router.get("/:id/repo-stats", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const commits = db.select().from(schema.commits).where(eq(schema.commits.collectionId, id)).all();

  // Group by repo
  const byRepo = new Map<number, { repoId: number; commits: number; insertions: number; deletions: number }>();
  for (const c of commits) {
    const existing = byRepo.get(c.repoId);
    if (existing) {
      existing.commits += 1;
      existing.insertions += c.insertions;
      existing.deletions += c.deletions;
    } else {
      byRepo.set(c.repoId, { repoId: c.repoId, commits: 1, insertions: c.insertions, deletions: c.deletions });
    }
  }

  // Enrich with repo names and sort
  const result = [...byRepo.values()].map((stat) => {
    const repo = db.select().from(schema.repositories)
      .where(and(eq(schema.repositories.id, stat.repoId), eq(schema.repositories.workspaceId, ctx.workspace.id)))
      .get();
    return { ...stat, repoName: repo?.name || `Repo #${stat.repoId}` };
  }).sort((a, b) => b.commits - a.commits);

  return c.json(result);
});

export { router as collectionsRouter };
export { collectionDetailRouter } from "./collection-detail";
