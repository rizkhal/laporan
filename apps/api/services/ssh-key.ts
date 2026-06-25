import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync, chmodSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_ROOT = path.join(__dirname, "..", ".storage", "ssh-keys");

export interface SshKeyData {
  id: number;
  workspaceId: number;
  name: string;
  publicKey: string;
  fingerprint: string | null;
  createdAt: string;
}

export interface SshKeyFiles {
  privateKeyPath: string;
  publicKeyPath: string;
  knownHostsPath: string;
}

/**
 * Get the storage directory for a workspace's SSH keys.
 */
export function getWorkspaceKeyDir(workspaceId: number): string {
  return path.join(STORAGE_ROOT, String(workspaceId));
}

/**
 * Get file paths for a workspace's SSH key.
 */
export function getKeyFilePaths(workspaceId: number): SshKeyFiles {
  const dir = getWorkspaceKeyDir(workspaceId);
  return {
    privateKeyPath: path.join(dir, "id_ed25519"),
    publicKeyPath: path.join(dir, "id_ed25519.pub"),
    knownHostsPath: path.join(dir, "known_hosts"),
  };
}

/**
 * Ensure the storage directory exists with secure permissions.
 */
function ensureKeyDir(workspaceId: number): string {
  const dir = getWorkspaceKeyDir(workspaceId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  chmodSync(dir, 0o700);
  return dir;
}

/**
 * Generate an Ed25519 SSH key pair for a workspace.
 * Stores keys in .storage/ssh-keys/<workspaceId>/
 * Returns public key, fingerprint, and the files.
 */
export function generateSshKey(workspaceId: number): {
  publicKey: string;
  fingerprint: string;
  files: SshKeyFiles;
} {
  ensureKeyDir(workspaceId);
  const files = getKeyFilePaths(workspaceId);

  // Remove existing keys if any
  for (const f of [files.privateKeyPath, files.publicKeyPath]) {
    if (existsSync(f)) unlinkSync(f);
  }

  // Generate key
  const result = spawnSync("ssh-keygen", [
    "-t", "ed25519",
    "-C", `workspace:${workspaceId}`,
    "-f", files.privateKeyPath,
    "-N", "",
  ], { encoding: "utf-8" });

  if (result.error) {
    throw new Error(`Failed to generate SSH key: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ssh-keygen failed: ${result.stderr?.trim() || result.stdout?.trim() || "Unknown error"}`);
  }

  // Set secure permissions
  chmodSync(files.privateKeyPath, 0o600);
  chmodSync(files.publicKeyPath, 0o644);

  // Read public key
  const publicKey = readFileSync(files.publicKeyPath, "utf-8").trim();

  // Get fingerprint
  const fingerprint = getFingerprint(workspaceId);

  // Set up known_hosts
  setupKnownHosts(workspaceId);

  return { publicKey, fingerprint, files };
}

/**
 * Get the fingerprint of a workspace's SSH public key.
 */
export function getFingerprint(workspaceId: number): string {
  const files = getKeyFilePaths(workspaceId);
  if (!existsSync(files.publicKeyPath)) {
    throw new Error("SSH public key not found");
  }

  const result = spawnSync("ssh-keygen", [
    "-lf", files.publicKeyPath,
  ], { encoding: "utf-8" });

  if (result.error) {
    throw new Error(`Failed to get fingerprint: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ssh-keygen fingerprint failed: ${result.stderr?.trim() || "Unknown error"}`);
  }

  // Output format: "SHA256:xxxxx comment (ED25519)"
  // Extract just the fingerprint part
  const parts = result.stdout.trim().split(/\s+/);
  return parts[0] || "unknown";
}

/**
 * Set up known_hosts for github.com.
 * This populates the workspace's known_hosts file with GitHub's host key.
 */
export function setupKnownHosts(workspaceId: number): void {
  const files = getKeyFilePaths(workspaceId);
  const dir = getWorkspaceKeyDir(workspaceId);
  ensureKeyDir(workspaceId);

  // Only scan if known_hosts doesn't exist
  if (existsSync(files.knownHostsPath)) return;

  const result = spawnSync("ssh-keyscan", [
    "-H", "github.com",
  ], {
    encoding: "utf-8",
    timeout: 10000,
  });

  if (result.status === 0 && result.stdout.trim()) {
    writeFileSync(files.knownHostsPath, result.stdout.trim(), "utf-8");
    chmodSync(files.knownHostsPath, 0o644);
  } else {
    // Fallback: create a known_hosts with strict checking disabled note
    writeFileSync(files.knownHostsPath, "# GitHub host key not yet scanned\n", "utf-8");
  }
}

/**
 * Build GIT_SSH_COMMAND for a workspace's SSH key.
 */
export function buildGitSshCommand(workspaceId: number): string {
  const files = getKeyFilePaths(workspaceId);

  if (!existsSync(files.privateKeyPath)) {
    throw new Error("SSH private key not found for this workspace");
  }

  // Ensure known_hosts exists
  if (!existsSync(files.knownHostsPath)) {
    setupKnownHosts(workspaceId);
  }

  return `ssh -i ${files.privateKeyPath} -o UserKnownHostsFile=${files.knownHostsPath} -o StrictHostKeyChecking=yes`;
}

/**
 * Build GIT_SSH_COMMAND for a workspace's SSH key, allowing lenient checking
 * for development environments.
 */
export function buildGitSshCommandLenient(workspaceId: number): string {
  const files = getKeyFilePaths(workspaceId);

  if (!existsSync(files.privateKeyPath)) {
    throw new Error("SSH private key not found for this workspace");
  }

  return `ssh -i ${files.privateKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null`;
}

/**
 * Run a shell command with the workspace SSH key environment.
 * Returns the combined stdout+stderr output.
 */
export function runWithSshKey(
  workspaceId: number,
  command: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number; lenientHostKey?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
  const keyDir = getWorkspaceKeyDir(workspaceId);
  ensureKeyDir(workspaceId);

  const gitSshCmd = options?.lenientHostKey
    ? buildGitSshCommandLenient(workspaceId)
    : buildGitSshCommand(workspaceId);

  const env = {
    ...process.env,
    GIT_SSH_COMMAND: gitSshCmd,
    HOME: keyDir, // Helps ssh find the key
  };

  const result = spawnSync(command, args, {
    env,
    encoding: "utf-8",
    timeout: options?.timeout || 15000,
    maxBuffer: (options?.maxBuffer || 10) * 1024 * 1024,
  });

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status ?? -1,
  };
}

/**
 * Test connection to GitHub using the workspace SSH key.
 * Returns { success, message, details }.
 */
export function testGitHubConnection(workspaceId: number): {
  success: boolean;
  message: string;
  details: string;
} {
  const files = getKeyFilePaths(workspaceId);

  if (!existsSync(files.privateKeyPath)) {
    return {
      success: false,
      message: "No SSH key found for this workspace. Generate an SSH key first.",
      details: "Run ssh-keygen first using the generate endpoint.",
    };
  }

  const gitSshCmd = buildGitSshCommandLenient(workspaceId);

  const env = {
    ...process.env,
    GIT_SSH_COMMAND: gitSshCmd,
  };

  const result = spawnSync("ssh", [
    "-i", files.privateKeyPath,
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-T", "git@github.com",
  ], {
    env,
    encoding: "utf-8",
    timeout: 15000,
  });

  const output = (result.stdout + result.stderr).trim();

  // GitHub returns exit code 1 even on success with message
  // "Hi <user>! You've successfully authenticated..."
  if (output.includes("successfully authenticated")) {
    return {
      success: true,
      message: "GitHub authentication successful.",
      details: output,
    };
  }

  if (output.includes("Permission denied")) {
    return {
      success: false,
      message: "SSH key is not authorized on GitHub. Add the public key to GitHub Deploy Keys or account SSH keys.",
      details: output,
    };
  }

  if (output.includes("could not resolve") || output.includes("Connection refused")) {
    return {
      success: false,
      message: "Cannot connect to GitHub. Check your network connection.",
      details: output,
    };
  }

  // Unknown response
  return {
    success: output.length > 0,
    message: output.length > 0 ? `GitHub responded: ${output.slice(0, 200)}` : "No response from GitHub.",
    details: output || "No output from SSH command.",
  };
}

/**
 * Test connection to a Git repository using the workspace SSH key.
 * Returns { success, message, defaultBranch?, refsFound? }.
 */
export function testRepoConnection(
  workspaceId: number,
  repoUrl: string,
): {
  success: boolean;
  message: string;
  defaultBranch?: string;
  refsFound?: number;
} {
  const files = getKeyFilePaths(workspaceId);

  if (!existsSync(files.privateKeyPath)) {
    return {
      success: false,
      message: "No SSH key found for this workspace. Generate an SSH key first.",
    };
  }

  // Validate URL is an SSH URL
  if (!repoUrl.startsWith("git@") && !repoUrl.startsWith("ssh://")) {
    return {
      success: false,
      message: "Invalid repository SSH URL. Repository URL must use SSH format (e.g., git@github.com:owner/repo.git).",
    };
  }

  const result = runWithSshKey(workspaceId, "git", ["ls-remote", repoUrl], {
    timeout: 20000,
    lenientHostKey: true,
  });

  const output = (result.stdout + result.stderr).trim();

  if (result.exitCode === 0 && result.stdout.trim().length > 0) {
    // Parse refs
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    const refs = lines.filter(l => l.includes("refs/"));

    // Find default branch (HEAD reference)
    const headLine = lines.find(l => l.includes("HEAD"));
    let defaultBranch: string | undefined;
    if (headLine) {
      const parts = headLine.split("\t");
      if (parts.length > 1) {
        const ref = parts[1];
        defaultBranch = ref.replace("refs/heads/", "").replace("refs/", "");
      }
    }

    return {
      success: true,
      message: "Repository connection successful.",
      defaultBranch,
      refsFound: refs.length,
    };
  }

  if (output.includes("Permission denied")) {
    return {
      success: false,
      message: "SSH key is not authorized. Add the workspace public key to the repository Deploy Keys.",
    };
  }

  if (output.includes("repository not found") || output.includes("does not appear to be a git repository")) {
    return {
      success: false,
      message: "Repository not found or this SSH key does not have access.",
    };
  }

  if (output.includes("could not resolve") || output.includes("Name or service not known")) {
    return {
      success: false,
      message: "Could not resolve the repository host. Check the repository URL.",
    };
  }

  if (output.includes("Connection refused") || output.includes("Connection timed out")) {
    return {
      success: false,
      message: "Connection refused or timed out. Check your network and the repository URL.",
    };
  }

  // Fallback: show raw error
  const errorMsg = output.slice(0, 300) || `git exit code: ${result.exitCode}`;
  return {
    success: false,
    message: `Connection failed: ${errorMsg}`,
  };
}

/**
 * Delete SSH key files for a workspace.
 */
export function deleteSshKeyFiles(workspaceId: number): void {
  const dir = getWorkspaceKeyDir(workspaceId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
