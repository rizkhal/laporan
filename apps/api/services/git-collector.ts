import { db } from "../db/index";
import * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { execGit } from "./git-exec";
import { pullRepo } from "./git-clone";

const NOISY_FILES = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "node_modules",
  "dist",
  "build",
  "vendor",
  ".next",
  "coverage",
  ".expo",
  ".turbo",
  ".cache",
  ".min.js",
  ".min.css",
  ".bundle.js",
];

function isNoisyFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  for (const pattern of NOISY_FILES) {
    if (lower.includes(pattern)) return true;
  }
  return false;
}

interface RawCommit {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
}

export interface CollectedCommit {
  hash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  diffStat: { file: string; insertions: number; deletions: number }[];
  patchSnippets: { file: string; patch: string }[];
  changedFiles: string[];
}

async function getCommitsInRange(
  repoPath: string,
  since: string,
  until: string,
  authors: string[],
  emails: string[],
  workspaceId?: number,
): Promise<RawCommit[]> {
  const args = [
    "log",
    "--format=%H||%an||%ae||%aI||%s",
    `--since=${since}`,
    `--until=${until}`,
    "--all",
    "--no-merges",
    ...authors.map((a) => `--author=${a}`),
    ...emails.map((e) => `--author=${e}`),
  ];

  const result = await execGit(args, { cwd: repoPath, workspaceId, timeout: 60000 });

  if (!result.stdout.trim()) return [];

  return result.stdout
    .trim()
    .split("\n")
    .map((line: string) => {
      const [hash, authorName, authorEmail, date, ...msgParts] =
        line.split("||");
      return {
        hash,
        authorName,
        authorEmail,
        date,
        message: msgParts.join("||"),
      };
    });
}

async function getCommitFileStats(
  repoPath: string,
  hash: string,
  workspaceId?: number,
): Promise<{
  filesChanged: number;
  insertions: number;
  deletions: number;
  fileStats: { file: string; insertions: number; deletions: number }[];
}> {
  const result = await execGit(
    ["diff-tree", "--no-commit-id", "-r", "-c", "--numstat", hash],
    { cwd: repoPath, workspaceId, timeout: 30000 },
  );

  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  const fileStats: { file: string; insertions: number; deletions: number }[] = [];

  if (result.stdout.trim()) {
    for (const line of result.stdout.trim().split("\n")) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const [ins, del, file] = parts;
      if (isNoisyFile(file)) continue;
      filesChanged++;
      const insNum = parseInt(ins) || 0;
      const delNum = parseInt(del) || 0;
      insertions += insNum;
      deletions += delNum;
      fileStats.push({ file, insertions: insNum, deletions: delNum });
    }
  }

  return { filesChanged, insertions, deletions, fileStats };
}

async function getCommitPatchSnippets(
  repoPath: string,
  hash: string,
  maxFiles = 20,
  workspaceId?: number,
): Promise<{ file: string; patch: string }[]> {
  const result = await execGit(
    ["show", "--no-color", "--format=", hash],
    { cwd: repoPath, workspaceId, timeout: 30000 },
  );

  const snippets: { file: string; patch: string }[] = [];
  const blocks = result.stdout.split("diff --git ");
  let count = 0;

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    const fileLine = lines[0];
    const filePath = fileLine.replace(/^a\//, "").replace(/ b\//, "").trim();
    if (!filePath || isNoisyFile(filePath)) continue;

    const patch = "diff --git " + block;
    // Truncate large patches
    const truncated = patch.split("\n").slice(0, 80).join("\n");
    snippets.push({ file: filePath, patch: truncated });
    count++;
    if (count >= maxFiles) break;
  }

  return snippets;
}

export async function collectCommits(
  repoPath: string,
  year: number,
  month: number,
  authorNames: string[],
  authorEmails: string[],
  workspaceId?: number,
  onProgress?: (hash: string, idx: number, total: number) => void,
): Promise<CollectedCommit[]> {
  const since = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const until = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  // Verify git repo
  try {
    await execGit(["rev-parse", "--git-dir"], { cwd: repoPath, workspaceId, timeout: 10000 });
  } catch {
    throw new Error(`Invalid git repository: ${repoPath}`);
  }

  const rawCommits = await getCommitsInRange(
    repoPath, since, until, authorNames, authorEmails, workspaceId,
  );
  const collected: CollectedCommit[] = [];

  for (let i = 0; i < rawCommits.length; i++) {
    const rc = rawCommits[i];
    if (onProgress) onProgress(rc.hash, i, rawCommits.length);

    const [stats, patches] = await Promise.all([
      getCommitFileStats(repoPath, rc.hash, workspaceId),
      getCommitPatchSnippets(repoPath, rc.hash, 20, workspaceId),
    ]);

    collected.push({
      hash: rc.hash,
      authorName: rc.authorName,
      authorEmail: rc.authorEmail,
      date: rc.date,
      message: rc.message,
      filesChanged: stats.filesChanged,
      insertions: stats.insertions,
      deletions: stats.deletions,
      diffStat: stats.fileStats,
      patchSnippets: patches,
      changedFiles: stats.fileStats.map((f) => f.file),
    });
  }

  return collected;
}

export async function collectRepoForCollection(
  repoId: number,
  collectionId: number,
  workspaceId: number,
) {
  const repo = db
    .select()
    .from(schema.repositories)
    .where(and(eq(schema.repositories.id, repoId), eq(schema.repositories.workspaceId, workspaceId)))
    .get();
  if (!repo) throw new Error("Repository not found in this workspace");

  const collection = db
    .select()
    .from(schema.collections)
    .where(eq(schema.collections.id, collectionId))
    .get();
  if (!collection) throw new Error("Collection not found");

  const authorNames = JSON.parse(repo.authorNames) as string[];
  const authorEmails = JSON.parse(repo.authorEmails) as string[];

  // Delete existing commits for this repo+collection
  db.delete(schema.commits)
    .where(
      and(
        eq(schema.commits.repoId, repoId),
        eq(schema.commits.collectionId, collectionId),
      ),
    )
    .run();

  // Ensure repo is up-to-date before collecting (async, non-blocking)
  try {
    const pullResult = await pullRepo(workspaceId, repo.localPath);
    if (!pullResult.success) {
      console.warn(`[git-collector] Pull warning for ${repo.name}: ${pullResult.message}`);
    }
  } catch (err: any) {
    console.warn(`[git-collector] Pull failed for ${repo.name}: ${err.message}`);
  }

  const commits = await collectCommits(
    repo.localPath,
    collection.year,
    collection.month,
    authorNames,
    authorEmails,
    workspaceId,
  );

  for (const c of commits) {
    db.insert(schema.commits)
      .values({
        collectionId,
        repoId,
        hash: c.hash,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        date: c.date,
        message: c.message,
        filesChanged: c.filesChanged,
        insertions: c.insertions,
        deletions: c.deletions,
        diffStat: JSON.stringify(c.diffStat),
        patchSnippets: JSON.stringify(c.patchSnippets),
        changedFiles: JSON.stringify(c.changedFiles),
      })
      .run();
  }

  return commits.length;
}
