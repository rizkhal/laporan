import { existsSync, mkdirSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execGit, generateExecId, killGitExec } from "./git-exec";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_STORAGE = path.join(__dirname, "..", ".storage", "repos");

/**
 * Get the managed local path for a workspace's repository clone.
 * Repos are stored under .storage/repos/<workspaceId>/<repoName>/
 */
export function resolveRepoPath(workspaceId: number, repoName: string): string {
  const safeName = repoName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(REPO_STORAGE, String(workspaceId), safeName);
}

/**
 * Validate that a directory contains a valid git repository.
 * Runs `git rev-parse --git-dir` to verify.
 */
async function isValidGitRepo(localPath: string): Promise<boolean> {
  try {
    const result = await execGit(["rev-parse", "--git-dir"], {
      cwd: localPath,
      timeout: 10000,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Remove a directory forcefully, retrying if necessary.
 * Ensures the directory is actually gone before returning.
 */
function forceRemoveDir(dirPath: string): boolean {
  if (!existsSync(dirPath)) return true;

  try {
    rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    // Fallback: try with spawnSync
    try {
      const { spawnSync } = require("child_process");
      spawnSync("rm", ["-rf", dirPath], { timeout: 30000 });
    } catch {}
  }

  // Verify it's gone
  return !existsSync(dirPath);
}

/**
 * Clean a stale/orphaned clone directory.
 * Removes the directory from disk unconditionally.
 */
export function cleanStaleClone(workspaceId: number, repoName: string): boolean {
  const localPath = resolveRepoPath(workspaceId, repoName);
  return forceRemoveDir(localPath);
}

/**
 * Clone a repository into the managed storage directory.
 * Async — does NOT block the event loop.
 * Returns { success, localPath, message }.
 */
export async function cloneRepo(
  workspaceId: number,
  remoteUrl: string,
  repoName: string,
): Promise<{ success: boolean; localPath: string; message: string }> {
  const localPath = resolveRepoPath(workspaceId, repoName);
  const parentDir = path.dirname(localPath);

  // Create parent directory if needed
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }

  // Check for existing clone — validate it's a real git repo
  if (existsSync(localPath)) {
    if (existsSync(path.join(localPath, ".git")) && (await isValidGitRepo(localPath))) {
      return { success: true, localPath, message: "Repository already cloned" };
    }
    // Stale/incomplete clone — remove it
    forceRemoveDir(localPath);
  }

  // Ensure parent dir still exists (might have been cleaned up)
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }

  // Generate execId for process tracking (cancellation support)
  const execId = generateExecId();

  const result = await execGit(["clone", remoteUrl, localPath], {
    workspaceId,
    timeout: 600000,
    execId,
  });

  // Remove from tracking
  killGitExec(execId);

  if (result.exitCode !== 0) {
    const error = result.stderr.trim() || result.stdout.trim() || "Unknown clone error";
    return { success: false, localPath, message: `Clone failed: ${error}` };
  }

  // Post-clone validation: verify .git directory exists
  if (!existsSync(path.join(localPath, ".git"))) {
    return { success: false, localPath, message: "Clone completed but .git directory not found. Possible file system race condition." };
  }

  return { success: true, localPath, message: "Repository cloned successfully" };
}

/**
 * Pull latest changes for an already-cloned repository.
 * Async — does NOT block the event loop.
 * Returns { success, message }.
 */
export async function pullRepo(
  workspaceId: number,
  localPath: string,
): Promise<{ success: boolean; message: string }> {
  if (!existsSync(path.join(localPath, ".git"))) {
    return { success: false, message: "Not a git repository" };
  }

  const execId = generateExecId();

  const result = await execGit(["pull", "--ff-only"], {
    cwd: localPath,
    workspaceId,
    timeout: 120000,
    execId,
  });

  killGitExec(execId);

  if (result.exitCode !== 0) {
    const error = result.stderr.trim() || result.stdout.trim() || "Pull failed";
    return { success: false, message: `Pull failed: ${error}` };
  }

  return { success: true, message: "Repository updated" };
}

/**
 * Ensure a repository is cloned and up-to-date.
 * Clones if not exists, pulls if already cloned.
 * Async — does NOT block the event loop.
 */
export async function ensureRepoCloned(
  workspaceId: number,
  remoteUrl: string,
  repoName: string,
): Promise<{ success: boolean; localPath: string; message: string }> {
  const localPath = resolveRepoPath(workspaceId, repoName);
  const gitDir = path.join(localPath, ".git");

  if (existsSync(gitDir) && (await isValidGitRepo(localPath))) {
    const pullResult = await pullRepo(workspaceId, localPath);
    return {
      success: pullResult.success,
      localPath,
      message: pullResult.message,
    };
  }

  return cloneRepo(workspaceId, remoteUrl, repoName);
}
