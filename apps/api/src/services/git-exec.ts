import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { getKeyFilePaths, buildGitSshCommandLenient } from "./ssh-key";

// ── Process Tracking ──
// Allows killing spawned git processes by execution ID
const childProcesses = new Map<string, ChildProcess>();

/**
 * Generate a unique execution ID.
 */
export function generateExecId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Kill a spawned git process by execution ID.
 * Uses SIGKILL to ensure the process and its children are terminated.
 */
export function killGitExec(execId: string): boolean {
  const child = childProcesses.get(execId);
  if (child) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Process may already be dead
    }
    childProcesses.delete(execId);
    return true;
  }
  return false;
}

/**
 * Execute a git command asynchronously using spawn.
 * Returns stdout, stderr, and exit code.
 * Does NOT block the event loop.
 *
 * If options.execId is provided, the spawned process will be tracked
 * and can be killed via killGitExec().
 */
export function execGit(
  args: string[],
  options?: {
    cwd?: string;
    workspaceId?: number;
    timeout?: number;
    maxBuffer?: number;
    execId?: string; // If set, tracks the process for cancellation
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string | undefined> = { ...process.env as any };

    // Inject workspace SSH key if available
    if (options?.workspaceId) {
      try {
        const files = getKeyFilePaths(options.workspaceId);
        if (existsSync(files.privateKeyPath)) {
          env.GIT_SSH_COMMAND = buildGitSshCommandLenient(options.workspaceId);
        }
      } catch {}
    }

    const child = spawn("git", args, {
      cwd: options?.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Track process if execId is provided
    if (options?.execId) {
      childProcesses.set(options.execId, child);
    }

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Timeout handling
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (options?.timeout && options.timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        // Kill the process tree
        try {
          child.kill("SIGKILL");
        } catch {}
        if (options?.execId) childProcesses.delete(options.execId);
        reject(new Error(`Git command timed out after ${options.timeout}ms: git ${args.join(" ")}`));
      }, options.timeout);
    }

    const cleanup = () => {
      if (options?.execId) childProcesses.delete(options.execId);
      if (timer) clearTimeout(timer);
    };

    child.on("close", (code) => {
      if (timedOut) return;
      cleanup();
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });

    child.on("error", (err) => {
      if (timedOut) return;
      cleanup();
      reject(err);
    });
  });
}
