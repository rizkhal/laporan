import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiFetch, apiUrl, setActiveWorkspaceId } from "./utils";

interface User {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
}

interface Workspace {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: { name?: string; email?: string; avatar?: string | null }) => Promise<void>;
  switchWorkspace: (workspaceId: number) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, description?: string | null) => Promise<Workspace>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function loadActiveWorkspace(): Workspace | null {
  try {
    const data = localStorage.getItem("active_workspace");
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(loadActiveWorkspace);

  // Sync active workspace to utils header
  useEffect(() => {
    if (activeWorkspace) {
      setActiveWorkspaceId(activeWorkspace.id);
    }
  }, [activeWorkspace]);

  // On mount, verify token and load workspaces
  useEffect(() => {
    async function verify() {
      const stored = localStorage.getItem("auth_token");
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(apiUrl("/auth/me"), {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (!res.ok) throw new Error("Invalid token");
        const data = await res.json();
        setUser(data.user);
        if (data.workspaces?.length > 0) {
          setWorkspaces(data.workspaces);
          // Set active workspace if not set or if current one is stale
          const storedWs = loadActiveWorkspace();
          const validWs = data.workspaces.find((w: Workspace) => w.id === storedWs?.id);
          if (validWs) {
            setActiveWorkspace(validWs);
          } else {
            setActiveWorkspace(data.workspaces[0]);
          }
        }
      } catch {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("active_workspace");
        setToken(null);
        setActiveWorkspace(null);
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(err.error || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);

    // Fetch workspaces after login
    try {
      const meRes = await fetch(apiUrl("/auth/me"), {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const meData = await meRes.json();
      if (meData.workspaces?.length > 0) {
        setWorkspaces(meData.workspaces);
        setActiveWorkspace(meData.workspaces[0]);
      }
    } catch {}
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(apiUrl("/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Registration failed" }));
      throw new Error(err.error || "Registration failed");
    }
    const data = await res.json();
    localStorage.setItem("auth_token", data.token);
    setToken(data.token);
    setUser(data.user);

    // Fetch workspaces after registration
    try {
      const meRes = await fetch(apiUrl("/auth/me"), {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const meData = await meRes.json();
      if (meData.workspaces?.length > 0) {
        setWorkspaces(meData.workspaces);
        setActiveWorkspace(meData.workspaces[0]);
      }
    } catch {}
  }, []);

  const logout = useCallback(() => {
    const stored = localStorage.getItem("auth_token");
    if (stored) {
      fetch(apiUrl("/auth/logout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${stored}` },
      }).catch(() => {});
    }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("active_workspace");
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspace(null);
  }, []);

  const updateProfile = useCallback(async (data: { name?: string; email?: string; avatar?: string | null }) => {
    const stored = localStorage.getItem("auth_token");
    if (!stored) throw new Error("Not authenticated");
    const res = await fetch(apiUrl("/auth/profile"), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${stored}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Update failed" }));
      throw new Error(err.error || "Update failed");
    }
    const updated = await res.json();
    setUser(updated);
  }, []);

  const switchWorkspace = useCallback(async (workspaceId: number) => {
    // Find the workspace in the list
    const ws = workspaces.find(w => w.id === workspaceId);
    if (!ws) throw new Error("Workspace not found");

    // Store the active workspace
    localStorage.setItem("active_workspace", JSON.stringify(ws));
    setActiveWorkspace(ws);
    setActiveWorkspaceId(workspaceId);

    // Force reload by navigating to dashboard
    window.location.href = "/dashboard";
  }, [workspaces]);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const data = await apiFetch<Workspace[]>("/workspaces");
      setWorkspaces(data);
      // Update active workspace if it exists in the list
      const current = loadActiveWorkspace();
      const match = data.find(w => w.id === current?.id);
      if (match) {
        setActiveWorkspace(match);
        localStorage.setItem("active_workspace", JSON.stringify(match));
      } else if (data.length > 0) {
        setActiveWorkspace(data[0]);
        localStorage.setItem("active_workspace", JSON.stringify(data[0]));
      }
    } catch {}
  }, []);

  const createWorkspace = useCallback(async (name: string, description?: string | null): Promise<Workspace> => {
    const ws = await apiFetch<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
    await refreshWorkspaces();
    return ws;
  }, [refreshWorkspaces]);

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      workspaces, activeWorkspace,
      login, register, logout, updateProfile,
      switchWorkspace, refreshWorkspaces, createWorkspace,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
