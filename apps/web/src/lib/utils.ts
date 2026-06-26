import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

// Track the active workspace ID for API requests
let _activeWorkspaceId: number | null = null;

export function setActiveWorkspaceId(id: number | null) {
  _activeWorkspaceId = id;
}

export function getActiveWorkspaceId(): number | null {
  return _activeWorkspaceId;
}

export function apiUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}/api${p}`;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Add workspace header if available
  const wsId = getActiveWorkspaceId();
  if (wsId) headers["X-Workspace-Id"] = String(wsId);

  const res = await fetch(apiUrl(path), {
    headers: { ...headers, ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // Throw a structured error with the HTTP status so callers can handle 429 specially
    const httpErr = new Error(err.error || err.message || "Request failed") as any;
    httpErr.status = res.status;
    throw httpErr;
  }
  return res.json();
}
