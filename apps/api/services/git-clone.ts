import { spawnSync } from "child_process";
import { existsSync, mkdirSync, chmodSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getKeyFilePaths, buildGitSshCommandLenient } from "./ssh-key";

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
 * Run a git command with workspace SSH key environment.
 */
function runGitSsh(workspaceId: number, cwd: string | undefined, args: string[], timeout = 30000): { stdout: string; stderr: string; exitCode: number } {
  const env: Record<string, string | undefined> = { ...process.env as any };

  try {
    const files = getKeyFilePaths(workspaceId);
    if (existsSync(files.privateKeyPath)) {
      env.GIT_SSH_COMMAND = buildGitSshCommandLenient(workspaceId);
    }
  } catch {}

  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    timeout,
    env,
  });

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? -1,
  };
}

/**
 * Clone a repository into the managed storage directory.
 * Returns { success, localPath, message }.
 */
export function cloneRepo(
  workspaceId: number,
  remoteUrl: string,
  repoName: string,
): { success: boolean; localPath: string; message: string } {
  const localPath = resolveRepoPath(workspaceId, repoName);
  const parentDir = path.dirname(localPath);

  // Create parent directory if needed
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }

  // Remove stale/incomplete clone
  if (existsSync(localPath)) {
    if (!existsSync(path.join(localPath, ".git"))) {
      rmSync(localPath, { recursive: true, force: true });
    } else {
      return { success: true, localPath, message: "Repository already cloned" };
    }
  }

  const result = runGitSsh(workspaceId, undefined, ["clone", remoteUrl, localPath], 120000);

  if (result.exitCode !== 0) {
    const error = result.stderr.trim() || result.stdout.trim() || "Unknown clone error";
    return { success: false, localPath, message: `Clone failed: ${error}` };
  }

  return { success: true, localPath, message: "Repository cloned successfully" };
}

/**
 * Pull latest changes for an already-cloned repository.
 * Returns { success, message }.
 */
export function pullRepo(
  workspaceId: number,
  localPath: string,
): { success: boolean; message: string } {
  if (!existsSync(path.join(localPath, ".git"))) {
    return { success: false, message: "Not a git repository" };
  }

  const result = runGitSsh(workspaceId, localPath, ["pull", "--ff-only"], 60000);

  if (result.exitCode !== 0) {
    const error = result.stderr.trim() || result.stdout.trim() || "Pull failed";
    return { success: false, message: `Pull failed: ${error}` };
  }

  return { success: true, message: "Repository updated" };
}

/**
 * Ensure a repository is cloned and up-to-date.
 * Clones if not exists, pulls if already cloned.
 * Returns { success, localPath, message }.
 */
export function ensureRepoCloned(
  workspaceId: number,
  remoteUrl: string,
  repoName: string,
): { success: boolean; localPath: string; message: string } {
  const localPath = resolveRepoPath(workspaceId, repoName);
  const gitDir = path.join(localPath, ".git");

  if (existsSync(gitDir)) {
    // Already cloned — pull latest
    const pullResult = pullRepo(workspaceId, localPath);
    return {
      success: pullResult.success,
      localPath,
      message: pullResult.message,
    };
  }

  // Clone
  return cloneRepo(workspaceId, remoteUrl, repoName);
}
