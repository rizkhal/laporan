import { spawn } from "child_process";
import { existsSync } from "fs";
import { getKeyFilePaths, buildGitSshCommandLenient, setupKnownHosts } from "./ssh-key";

/**
 * Execute an SSH-based git command asynchronously using spawn.
 * Does NOT block the event loop.
 */
function execSsh(
  command: string,
  args: string[],
  options?: {
    workspaceId: number;
    timeout?: number;
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const files = getKeyFilePaths(options!.workspaceId);

    if (!existsSync(files.privateKeyPath)) {
      resolve({
        stdout: "",
        stderr: "No SSH key found",
        exitCode: -1,
      });
      return;
    }

    const env = {
      ...process.env,
      GIT_SSH_COMMAND: buildGitSshCommandLenient(options!.workspaceId),
    };

    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (options?.timeout && options.timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);
    }

    child.on("close", (code) => {
      if (timedOut) return;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });

    child.on("error", (err) => {
      if (timedOut) return;
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Test connection to GitHub using the workspace SSH key.
 * Async — does NOT block the event loop.
 */
export async function testGitHubConnection(workspaceId: number): Promise<{
  success: boolean;
  message: string;
  details: string;
}> {
  const files = getKeyFilePaths(workspaceId);
  if (!existsSync(files.privateKeyPath)) {
    return {
      success: false,
      message: "No SSH key found for this workspace. Generate an SSH key first.",
      details: "Run ssh-keygen first using the generate endpoint.",
    };
  }

  // Ensure known_hosts is populated
  setupKnownHosts(workspaceId);

  const result = await execSsh("ssh", [
    "-i", files.privateKeyPath,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `UserKnownHostsFile=${files.knownHostsPath}`,
    "-T", "git@github.com",
  ], { workspaceId, timeout: 15000 });

  const output = (result.stdout + result.stderr).trim();

  if (output.includes("successfully authenticated")) {
    return { success: true, message: "GitHub authentication successful.", details: output };
  }

  if (output.includes("Permission denied")) {
    return {
      success: false,
      message: "SSH key is not authorized on GitHub. Add the public key to GitHub Deploy Keys or account SSH keys.",
      details: output,
    };
  }

  if (output.includes("could not resolve") || output.includes("Connection refused")) {
    return { success: false, message: "Cannot connect to GitHub. Check your network connection.", details: output };
  }

  return {
    success: output.length > 0,
    message: output.length > 0 ? `GitHub responded: ${output.slice(0, 200)}` : "No response from GitHub.",
    details: output || "No output from SSH command.",
  };
}

/**
 * Test connection to a Git repository using the workspace SSH key.
 * Async — does NOT block the event loop.
 */
export async function testRepoConnection(
  workspaceId: number,
  repoUrl: string,
): Promise<{
  success: boolean;
  message: string;
  defaultBranch?: string;
  refsFound?: number;
}> {
  const files = getKeyFilePaths(workspaceId);
  if (!existsSync(files.privateKeyPath)) {
    return { success: false, message: "No SSH key found for this workspace. Generate an SSH key first." };
  }

  if (!repoUrl.startsWith("git@") && !repoUrl.startsWith("ssh://")) {
    return { success: false, message: "Invalid repository SSH URL. Repository URL must use SSH format (e.g., git@github.com:owner/repo.git)." };
  }

  const result = await execSsh("git", ["ls-remote", repoUrl], {
    workspaceId,
    timeout: 20000,
  });

  const output = (result.stdout + result.stderr).trim();

  if (result.exitCode === 0 && result.stdout.trim().length > 0) {
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const refs = lines.filter(l => l.includes("refs/"));

    const headLine = lines.find(l => l.includes("HEAD"));
    let defaultBranch: string | undefined;
    if (headLine) {
      const parts = headLine.split("\t");
      if (parts.length > 1) {
        const ref = parts[1];
        defaultBranch = ref.replace("refs/heads/", "").replace("refs/", "");
      }
    }

    return { success: true, message: "Repository connection successful.", defaultBranch, refsFound: refs.length };
  }

  if (output.includes("Permission denied")) {
    return { success: false, message: "SSH key is not authorized. Add the workspace public key to the repository Deploy Keys." };
  }

  if (output.includes("repository not found") || output.includes("does not appear to be a git repository")) {
    return { success: false, message: "Repository not found or this SSH key does not have access." };
  }

  if (output.includes("could not resolve") || output.includes("Name or service not known")) {
    return { success: false, message: "Could not resolve the repository host. Check the repository URL." };
  }

  if (output.includes("Connection refused") || output.includes("Connection timed out")) {
    return { success: false, message: "Connection refused or timed out. Check your network and the repository URL." };
  }

  const errorMsg = output.slice(0, 300) || `git exit code: ${result.exitCode}`;
  return { success: false, message: `Connection failed: ${errorMsg}` };
}
