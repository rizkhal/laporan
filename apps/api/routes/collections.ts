import { Hono } from "hono";
import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod";

const router = new Hono();

router.get("/", (c) => {
  const collections = db.select().from(schema.collections).orderBy(desc(schema.collections.year), desc(schema.collections.month)).all();
  const parsed = collections.map(col => ({
    ...col,
    repoIds: col.repoIds ? JSON.parse(col.repoIds) : null,
  }));
  return c.json(parsed);
});

router.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ year: z.number(), month: z.number(), repoIds: z.array(z.number()).optional() }).parse(body);

  const title = `${new Date(parsed.year, parsed.month - 1).toLocaleString("default", { month: "long" })} ${parsed.year}`;

  // Check duplicate
  const existing = db.select().from(schema.collections)
    .where(and(eq(schema.collections.year, parsed.year), eq(schema.collections.month, parsed.month)))
    .get();
  if (existing) return c.json(existing);

  const result = db.insert(schema.collections).values({
    year: parsed.year,
    month: parsed.month,
    title,
    repoIds: parsed.repoIds ? JSON.stringify(parsed.repoIds) : null,
  }).returning().get();

  // Parse repoIds for response
  const resp = { ...result, repoIds: result.repoIds ? JSON.parse(result.repoIds) : null };
  return c.json(resp, 201);
});

router.get("/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  const collection = db.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  if (!collection) return c.json({ error: "Not found" }, 404);
  const resp = { ...collection, repoIds: collection.repoIds ? JSON.parse(collection.repoIds) : null };
  return c.json(resp);
});

router.delete("/:id", (c) => {
  const id = parseInt(c.req.param("id"));
  db.delete(schema.collections).where(eq(schema.collections.id, id)).run();
  return c.json({ success: true });
});

router.get("/:id/stats", (c) => {
  const id = parseInt(c.req.param("id"));

  const commits = db.select().from(schema.commits).where(eq(schema.commits.collectionId, id)).all();
  const analyses = db.select().from(schema.analyses).where(eq(schema.analyses.collectionId, id)).all();

  const repoIds = [...new Set(commits.map(c => c.repoId))];
  const repos = repoIds.map(rid => db.select().from(schema.repositories).where(eq(schema.repositories.id, rid)).get()).filter(Boolean);

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

export { router as collectionsRouter };
