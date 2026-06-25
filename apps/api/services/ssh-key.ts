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
  const parts = result.stdout.trim().split(/\s+/);
  return parts[0] || "unknown";
}

/**
 * Set up known_hosts for github.com.
 * This populates the workspace's known_hosts file with GitHub's host key.
 */
export function setupKnownHosts(workspaceId: number): void {
  const files = getKeyFilePaths(workspaceId);
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
 * Delete SSH key files for a workspace.
 */
export function deleteSshKeyFiles(workspaceId: number): void {
  const dir = getWorkspaceKeyDir(workspaceId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
