import { URL } from "url";

const PRIVATE_IP_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Private class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private class B
  /^192\.168\./, // Private class C
  /^169\.254\./, // Link-local / cloud metadata
  /^0\./, // Current network
];

const BLOCKED_HOSTNAMES = [
  "metadata.google.internal",
  "169.254.169.254",
  "0.0.0.0",
  "[::1]",
];

/**
 * Validate that a URL is safe for LLM API calls.
 * Blocks non-HTTP(S) schemes, private/internal IPs, cloud metadata endpoints,
 * and internal-looking hostnames.
 */
export function isSafeLLMUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "Only HTTP(S) URLs are allowed" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known metadata/internal endpoints
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: "Internal addresses are not allowed" };
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { valid: false, error: "Private/internal IP addresses are not allowed" };
    }
  }

  // Block IPv6 loopback and unique local addresses
  if (hostname.startsWith("[fc") || hostname.startsWith("[fd")) {
    return { valid: false, error: "Private/internal IP addresses are not allowed" };
  }

  // Block .local and .internal TLDs
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { valid: false, error: "Internal hostnames are not allowed" };
  }

  return { valid: true };
}

/**
 * Validate that a git remote URL uses an allowed scheme.
 * Allows: git@host:path, ssh://host/path, https://host/path, http://host/path
 * Blocks: file://, and other arbitrary schemes
 */
export function isValidGitUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url || typeof url !== "string" || url.length > 500) {
    return { valid: false, error: "Invalid repository URL" };
  }

  // SSH format: git@github.com:owner/repo.git
  if (url.startsWith("git@")) {
    return { valid: true };
  }

  // SSH explicit scheme
  if (url.startsWith("ssh://")) {
    return { valid: true };
  }

  // HTTPS/HTTP format
  if (url.startsWith("https://") || url.startsWith("http://")) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { valid: false, error: "Only HTTP(S) and SSH URLs are allowed" };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid URL format" };
    }
  }

  // Block file:// and everything else
  return {
    valid: false,
    error: "Only SSH (git@/ssh://) or HTTP(S) URLs are allowed",
  };
}
