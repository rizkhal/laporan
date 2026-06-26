import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, ne, desc, asc, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, assertOwnership } from "../lib/auth";

const router = new Hono();

// Helper: compute a deterministic unique key for a set of repoIds.
// This ensures DB-level uniqueness: same (workspaceId, year, month, repoIds)
// produces the same uniqueKey, so a UNIQUE index prevents duplicates.
function computeUniqueKey(repoIds: number[] | undefined | null): string {
  if (!repoIds || repoIds.length === 0) return "__ALL__";
  return JSON.stringify([...repoIds].sort());
}

// Helper: sync collection_repos junction table for a collection.
// Deletes existing entries, then inserts current ones.
function syncCollectionRepos(workspaceId: number, collectionId: number, repoIds: number[] | null | undefined, year: number, month: number) {
  db.delete(schema.collectionRepos)
    .where(eq(schema.collectionRepos.collectionId, collectionId))
    .run();

  if (repoIds && repoIds.length > 0) {
    for (const repoId of repoIds) {
      db.insert(schema.collectionRepos).values({
        workspaceId,
        collectionId,
        repoId,
        year,
        month,
      }).run();
    }
  }
}

// Helper: check if any repo in the given list is already assigned to another collection
// at the same (workspaceId, year, month). Returns the conflicting repo ID or null.
// When editing, pass the current collection's id to exclude self-repos.
function findConflictingRepos(
  workspaceId: number,
  year: number,
  month: number,
  repoIds: number[] | null | undefined,
  excludeCollectionId?: number,
): number | null {
  if (!repoIds || repoIds.length === 0) return null;

  for (const repoId of repoIds) {
    const conflict = db
      .select()
      .from(schema.collectionRepos)
      .where(
        and(
          eq(schema.collectionRepos.workspaceId, workspaceId),
          eq(schema.collectionRepos.repoId, repoId),
          eq(schema.collectionRepos.year, year),
          eq(schema.collectionRepos.month, month),
          excludeCollectionId
            ? ne(schema.collectionRepos.collectionId, excludeCollectionId)
            : undefined,
        ),
      )
      .get();

    if (conflict) return repoId;
  }

  return null;
}

// Helper: check if there's an "all repos" (null repoIds) collection at the same period
function hasAllReposCollection(workspaceId: number, year: number, month: number, excludeCollectionId?: number): boolean {
  const existing = db
    .select()
    .from(schema.collections)
    .where(
      and(
        eq(schema.collections.workspaceId, workspaceId),
        eq(schema.collections.year, year),
        eq(schema.collections.month, month),
        eq(schema.collections.uniqueKey, "__ALL__"),
        excludeCollectionId
          ? ne(schema.collections.id, excludeCollectionId)
          : undefined,
      ),
    )
    .get();
  return !!existing;
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
  const parsed = collections.map(col => ({
    ...col,
    repoIds: col.repoIds ? JSON.parse(col.repoIds) : null,
  }));
  return c.json(parsed);
});

// Create collection
router.post("/", async (c) => {
  const ctx = requireAuth(c);
  const body = await c.req.json();
  const parsed = z.object({ year: z.number(), month: z.number(), repoIds: z.array(z.number()).optional() }).parse(body);

  const uniqueKey = computeUniqueKey(parsed.repoIds);
  const title = `${new Date(parsed.year, parsed.month - 1).toLocaleString("default", { month: "long" })} ${parsed.year}`;

  // Check for duplicate using uniqueKey (exact DB-level match).
  const existing = db
    .select()
    .from(schema.collections)
    .where(
      and(
        eq(schema.collections.workspaceId, ctx.workspace.id),
        eq(schema.collections.year, parsed.year),
        eq(schema.collections.month, parsed.month),
        eq(schema.collections.uniqueKey, uniqueKey),
      ),
    )
    .get();

  if (existing) {
    return c.json({ error: `Koleksi untuk ${title} dengan repositori yang sama sudah ada.` }, 409);
  }

  // Per-repo uniqueness check: if repoIds is null (all repos), block if any collection exists at this period
  if (!parsed.repoIds || parsed.repoIds.length === 0) {
    const anyCollection = db
      .select()
      .from(schema.collections)
      .where(
        and(
          eq(schema.collections.workspaceId, ctx.workspace.id),
          eq(schema.collections.year, parsed.year),
          eq(schema.collections.month, parsed.month),
        ),
      )
      .get();
    if (anyCollection) {
      return c.json({ error: `Tidak dapat membuat koleksi untuk semua repositori karena sudah ada koleksi lain pada periode ${title}.` }, 409);
    }
  } else {
    // Check if any of the selected repos are already in another collection at this period
    const conflictRepoId = findConflictingRepos(ctx.workspace.id, parsed.year, parsed.month, parsed.repoIds);
    if (conflictRepoId !== null) {
      return c.json({ error: `Repositori ID ${conflictRepoId} sudah digunakan di koleksi lain pada periode ${title}.` }, 409);
    }
    // Also check if an "all repos" collection exists at this period
    if (hasAllReposCollection(ctx.workspace.id, parsed.year, parsed.month)) {
      return c.json({ error: `Tidak dapat membuat koleksi karena sudah ada koleksi untuk semua repositori pada periode ${title}.` }, 409);
    }
  }

  // Normalize: always store sorted repoIds for consistency
  const normalizedRepoIds = parsed.repoIds?.length
    ? JSON.stringify([...parsed.repoIds].sort())
    : null;

  const result = db.insert(schema.collections).values({
    workspaceId: ctx.workspace.id,
    year: parsed.year,
    month: parsed.month,
    title,
    repoIds: normalizedRepoIds,
    uniqueKey,
  }).returning().get();

  // Sync collection_repos junction table
  syncCollectionRepos(ctx.workspace.id, result.id, parsed.repoIds?.length ? parsed.repoIds : null, parsed.year, parsed.month);

  const resp = { ...result, repoIds: result.repoIds ? JSON.parse(result.repoIds) : null };
  return c.json(resp, 201);
});

// Get single collection
router.get("/:id", (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");
  const resp = { ...collection, repoIds: collection.repoIds ? JSON.parse(collection.repoIds) : null };
  return c.json(resp);
});

// Update collection (e.g., repo selection)
router.put("/:id", async (c) => {
  const ctx = requireAuth(c);
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  assertOwnership(collection, ctx.workspace.id, "Collection");

  const body = await c.req.json();
  const parsed = z.object({ repoIds: z.array(z.number()).nullable().optional() }).parse(body);

  const updateData: any = { updatedAt: new Date().toISOString() };
  if (parsed.repoIds !== undefined) {
    // Normalize: store sorted repoIds and update uniqueKey
    const normalizedRepoIds = parsed.repoIds?.length
      ? JSON.stringify([...parsed.repoIds].sort())
      : null;
    const newUniqueKey = computeUniqueKey(parsed.repoIds ?? undefined);

    // Check that updating this collection doesn't create a duplicate with another collection
    const duplicate = db
      .select()
      .from(schema.collections)
      .where(
        and(
          eq(schema.collections.workspaceId, ctx.workspace.id),
          eq(schema.collections.year, collection.year),
          eq(schema.collections.month, collection.month),
          eq(schema.collections.uniqueKey, newUniqueKey),
          ne(schema.collections.id, id),
        ),
      )
      .get();

    if (duplicate) {
      return c.json({
        error: `Koleksi untuk ${collection.title} dengan repositori yang sama sudah ada.`
      }, 409);
    }

    // Per-repo uniqueness check
    if (!parsed.repoIds || parsed.repoIds.length === 0) {
      // Switching to "all repos" — check no other collection exists at this period
      const anyOther = db
        .select()
        .from(schema.collections)
        .where(
          and(
            eq(schema.collections.workspaceId, ctx.workspace.id),
            eq(schema.collections.year, collection.year),
            eq(schema.collections.month, collection.month),
            ne(schema.collections.id, id),
          ),
        )
        .get();
      if (anyOther) {
        return c.json({ error: `Tidak dapat mengubah ke semua repositori karena sudah ada koleksi lain pada periode ${collection.title}.` }, 409);
      }
    } else {
      // Check if any of the new repos conflict with other collections
      const conflictRepoId = findConflictingRepos(ctx.workspace.id, collection.year, collection.month, parsed.repoIds, id);
      if (conflictRepoId !== null) {
        return c.json({ error: `Repositori ID ${conflictRepoId} sudah digunakan di koleksi lain pada periode ${collection.title}.` }, 409);
      }
      // Check if an "all repos" collection exists at this period
      if (hasAllReposCollection(ctx.workspace.id, collection.year, collection.month, id)) {
        return c.json({ error: `Tidak dapat mengubah repositori koleksi karena sudah ada koleksi untuk semua repositori pada periode ${collection.title}.` }, 409);
      }
    }

    updateData.repoIds = normalizedRepoIds;
    updateData.uniqueKey = newUniqueKey;
  }

  const result = db.update(schema.collections).set(updateData).where(eq(schema.collections.id, id)).returning().get();
  if (!result) return c.json({ error: "Not found" }, 404);

  // Sync collection_repos junction table if repoIds changed
  if (parsed.repoIds !== undefined) {
    syncCollectionRepos(ctx.workspace.id, result.id, parsed.repoIds?.length ? parsed.repoIds : null, collection.year, collection.month);
  }

  const resp = { ...result, repoIds: result.repoIds ? JSON.parse(result.repoIds) : null };
  return c.json(resp);
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
