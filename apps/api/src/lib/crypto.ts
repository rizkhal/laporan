import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let key: Buffer | null = null;
let keyInitialized = false;
let warnedAboutMissingKey = false;

function getKey(): Buffer | null {
  if (keyInitialized) return key;
  keyInitialized = true;

  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    if (!warnedAboutMissingKey) {
      console.warn(
        "⚠️ ENCRYPTION_KEY not set — API keys will be stored in plaintext. Set ENCRYPTION_KEY in .env for encryption at rest.",
      );
      warnedAboutMissingKey = true;
    }
    return null;
  }
  key = crypto.createHash("sha256").update(envKey).digest();
  return key;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns the plaintext as-is if ENCRYPTION_KEY is not set.
 * Format: enc:v1:<iv>:<ciphertext>:<authTag> (all base64)
 */
export function encrypt(plaintext: string): string {
  const k = getKey();
  if (!k) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, k, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return (
    PREFIX +
    iv.toString("base64") +
    ":" +
    encrypted.toString("base64") +
    ":" +
    authTag.toString("base64")
  );
}

/**
 * Decrypt a string that was encrypted with encrypt().
 * Returns the input as-is if it's not encrypted (backward compat with plaintext values).
 * Returns the input as-is if decryption fails or no key is available.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) return ciphertext;

  const k = getKey();
  if (!k) return ciphertext;

  try {
    const parts = ciphertext.slice(PREFIX.length).split(":");
    if (parts.length !== 3) return ciphertext;

    const iv = Buffer.from(parts[0], "base64");
    const encrypted = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, k, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return ciphertext;
  }
}

/**
 * Hash a session token using SHA-256.
 * Tokens are stored hashed in the DB so a DB compromise doesn't yield valid sessions.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Get the session expiry timestamp (7 days from now) as ISO string.
 */
export function getSessionExpiry(): string {
  return new Date(Date.now() + SESSION_DURATION_MS).toISOString();
}

/**
 * Check if a session has expired.
 */
export function isSessionExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false; // No expiry set — allow (backward compat)
  return new Date(expiresAt).getTime() < Date.now();
}
