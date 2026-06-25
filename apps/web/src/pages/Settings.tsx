import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { apiFetch, apiUrl, cn } from "../lib/utils";
import { useAuth } from "../lib/auth";
import {
  Plus, Pencil, Trash2, Loader2, Bot, KeyRound, FileText, User, Save,
  Building2, Hash, Check, X, AlertTriangle,
} from "lucide-react";

interface LLMProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

type SettingsTab = "profile" | "workspace";

const settingsNav = [
  { id: "profile" as SettingsTab, label: "Profile", icon: User },
  { id: "workspace" as SettingsTab, label: "Workspace", icon: Building2 },
];

export default function SettingsPage() {
  const { user, updateProfile, activeWorkspace, refreshWorkspaces, workspaces } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") === "workspace" ? "workspace" : "profile") as SettingsTab;
  const workspaceTab = (["general", "llm", "report-template"].includes(searchParams.get("ws") || "") ? searchParams.get("ws")! : "general") as "general" | "llm" | "report-template";

  // Profile state
  const [profileName, setProfileName] = useState(() => localStorage.getItem("settings:profileName") || "");
  const [profileEmail, setProfileEmail] = useState(() => localStorage.getItem("settings:profileEmail") || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Change password state
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  // Workspace state
  const [wsName, setWsName] = useState(() => localStorage.getItem("settings:wsName") || "");
  const [wsDescription, setWsDescription] = useState(() => localStorage.getItem("settings:wsDescription") || "");
  const [wsSaving, setWsSaving] = useState(false);
  const [wsSuccess, setWsSuccess] = useState<string | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
  const [wsSshKey, setWsSshKey] = useState<string | null>(null);

  // SSH key state
  const [sshKeyData, setSshKeyData] = useState<{ id: number; name: string; publicKey: string; fingerprint: string | null; createdAt: string } | null>(null);
  const [sshKeyLoading, setSshKeyLoading] = useState(false);
  const [sshKeyError, setSshKeyError] = useState<string | null>(null);
  const [sshTestResult, setSshTestResult] = useState<{ success: boolean; message: string; details: string } | null>(null);
  const [sshTestLoading, setSshTestLoading] = useState(false);
  const [sshGenerating, setSshGenerating] = useState(false);
  const [sshCopied, setSshCopied] = useState(false);

  // LLM state
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);
  const [editingLlm, setEditingLlm] = useState<LLMProvider | null>(null);
  const [llmForm, setLlmForm] = useState({ name: "", baseUrl: "", apiKey: "", model: "" });
  const [savingLlm, setSavingLlm] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Danger zone state
  const [deleteWsDialogOpen, setDeleteWsDialogOpen] = useState(false);
  const [deleteWsLoading, setDeleteWsLoading] = useState(false);
  const [deleteWsError, setDeleteWsError] = useState<string | null>(null);
  const [deleteAcctDialogOpen, setDeleteAcctDialogOpen] = useState(false);
  const [deleteAcctPassword, setDeleteAcctPassword] = useState("");
  const [deleteAcctLoading, setDeleteAcctLoading] = useState(false);
  const [deleteAcctError, setDeleteAcctError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setProfileName(user.name);
      setProfileEmail(user.email);
      localStorage.setItem("settings:profileName", user.name);
      localStorage.setItem("settings:profileEmail", user.email);
    }
    if (activeWorkspace) {
      setWsName(activeWorkspace.name);
      setWsDescription(activeWorkspace.description || "");
      localStorage.setItem("settings:wsName", activeWorkspace.name);
      localStorage.setItem("settings:wsDescription", activeWorkspace.description || "");
    }
    loadProviders().then(() => setLoading(false));
  }, [user, activeWorkspace]);

  // Refresh workspace info when tab changes to workspace
  const loadWorkspaceDetails = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const data = await apiFetch<{ name: string; description: string | null }>(`/workspaces/${activeWorkspace.id}`);
      setWsName(data.name);
      setWsDescription(data.description || "");
    } catch {}
  }, [activeWorkspace]);

  useEffect(() => {
    if (activeTab === "workspace" && activeWorkspace) {
      loadWorkspaceDetails();
      loadSshKey();
    }
  }, [activeTab, activeWorkspace, loadWorkspaceDetails]);

  async function loadProviders() {
    try {
      const data = await apiFetch<LLMProvider[]>("/settings/llm");
      setProviders(data);
    } catch {}
  }

  // ── SSH Key Handlers ──

  async function loadSshKey() {
    if (!activeWorkspace) return;
    setSshKeyLoading(true);
    setSshKeyError(null);
    try {
      const data = await apiFetch<{ id: number; name: string; publicKey: string; fingerprint: string | null; createdAt: string }>(`/workspaces/${activeWorkspace.id}/ssh-key`);
      setSshKeyData(data);
    } catch {
      setSshKeyData(null);
    } finally {
      setSshKeyLoading(false);
    }
  }

  async function handleGenerateSshKey() {
    if (!activeWorkspace) return;
    setSshGenerating(true);
    setSshKeyError(null);
    setSshTestResult(null);
    try {
      const result = await apiFetch<{ success: boolean; publicKey: string; fingerprint: string }>(`/workspaces/${activeWorkspace.id}/ssh-key/generate`, {
        method: "POST",
        body: JSON.stringify({ name: "default" }),
      });
      if (result.success) {
        setSshKeyData({ id: 0, name: "default", publicKey: result.publicKey, fingerprint: result.fingerprint, createdAt: new Date().toISOString() });
        setTimeout(() => loadSshKey(), 500);
      }
    } catch (err: any) {
      setSshKeyError(err.message);
    } finally {
      setSshGenerating(false);
    }
  }

  async function handleDeleteSshKey() {
    if (!activeWorkspace || !sshKeyData) return;
    if (!confirm("Delete this SSH key? This will break access to any repositories using this key.")) return;
    setSshKeyError(null);
    try {
      await apiFetch(`/workspaces/${activeWorkspace.id}/ssh-key`, { method: "DELETE" });
      setSshKeyData(null);
      setSshTestResult(null);
    } catch (err: any) {
      setSshKeyError(err.message);
    }
  }

  async function handleTestGitHub() {
    if (!activeWorkspace) return;
    setSshTestLoading(true);
    setSshTestResult(null);
    try {
      const result = await apiFetch<{ success: boolean; message: string; details: string }>(`/workspaces/${activeWorkspace.id}/ssh-key/test-github`, { method: "POST" });
      setSshTestResult(result);
    } catch (err: any) {
      setSshTestResult({ success: false, message: err.message, details: "" });
    } finally {
      setSshTestLoading(false);
    }
  }

  async function copyPublicKey() {
    if (!sshKeyData?.publicKey) return;
    try {
      await navigator.clipboard.writeText(sshKeyData.publicKey);
      setSshCopied(true);
      setTimeout(() => setSshCopied(false), 2000);
    } catch {}
  }

  async function handleSaveProfile() {
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);
    try {
      await updateProfile({ name: profileName, email: profileEmail });
      localStorage.setItem("settings:profileName", profileName);
      localStorage.setItem("settings:profileEmail", profileEmail);
      setProfileSuccess("Profile updated successfully.");
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPwError(null);
    setPwSuccess(null);

    if (!pwCurrent) { setPwError("Current password is required."); return; }
    if (!pwNew || pwNew.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError("New passwords do not match."); return; }

    setPwSaving(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      setPwSuccess("Password changed successfully.");
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setTimeout(() => setPwSuccess(null), 3000);
    } catch (err: any) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  async function handleSaveWorkspace() {
    if (!activeWorkspace) return;
    setWsError(null);
    setWsSuccess(null);
    setWsSaving(true);
    try {
      await apiFetch(`/workspaces/${activeWorkspace.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: wsName, description: wsDescription || null }),
      });
      await refreshWorkspaces();
      localStorage.setItem("settings:wsName", wsName);
      localStorage.setItem("settings:wsDescription", wsDescription || "");
      setWsSuccess("Workspace updated successfully.");
      setTimeout(() => setWsSuccess(null), 3000);
    } catch (err: any) {
      setWsError(err.message);
    } finally {
      setWsSaving(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!activeWorkspace) return;
    setDeleteWsError(null);
    setDeleteWsLoading(true);
    try {
      await apiFetch(`/workspaces/${activeWorkspace.id}`, { method: "DELETE" });
      setDeleteWsDialogOpen(false);
      // Navigate to dashboard and refresh
      await refreshWorkspaces();
      window.location.href = "/dashboard";
    } catch (err: any) {
      setDeleteWsError(err.message);
    } finally {
      setDeleteWsLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteAcctError(null);
    setDeleteAcctLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(apiUrl("/auth/account"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deleteAcctPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Deletion failed" }));
        throw new Error(err.error || "Deletion failed");
      }
      setDeleteAcctDialogOpen(false);
      // Clear auth state
      localStorage.removeItem("auth_token");
      localStorage.removeItem("active_workspace");
      window.location.href = "/login";
    } catch (err: any) {
      setDeleteAcctError(err.message);
    } finally {
      setDeleteAcctLoading(false);
    }
  }
  function openLlmForm(provider?: LLMProvider) {
    setEditingLlm(provider || null);
    setLlmForm(provider ? { name: provider.name, baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model } : { name: "", baseUrl: "https://router.rizkal.space/v1", apiKey: "", model: "" });
    setTestResult(null);
    setLlmDialogOpen(true);
  }

  async function handleSaveLlm() {
    try {
      setSavingLlm(true);
      if (editingLlm) {
        await apiFetch(`/settings/llm/${editingLlm.id}`, { method: "PUT", body: JSON.stringify(llmForm) });
      } else {
        await apiFetch("/settings/llm", { method: "POST", body: JSON.stringify(llmForm) });
      }
      await loadProviders();
      setLlmDialogOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingLlm(false);
    }
  }

  async function handleDeleteLlm(id: number) {
    if (!confirm("Delete this LLM provider?")) return;
    await apiFetch(`/settings/llm/${id}`, { method: "DELETE" });
    await loadProviders();
  }

  async function handleTest() {
    try {
      setTestResult("Testing...");
      const result = await apiFetch<{ success: boolean; content?: string; error?: string }>("/settings/llm/test", {
        method: "POST",
        body: JSON.stringify(llmForm),
      });
      setTestResult(result.success ? `✓ ${result.content?.slice(0, 100)}` : `✗ ${result.error}`);
    } catch (err: any) {
      setTestResult(`✗ ${err.message}`);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and workspace</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Sidebar */}
        <nav className="flex shrink-0 flex-col gap-1 lg:w-56">
          {settingsNav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setSearchParams({ tab: id, ws: workspaceTab }); }}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                activeTab === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {activeTab === "profile" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your account details.</p>
              </div>

              {profileError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{profileError}</div>
              )}
              {profileSuccess && (
                <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success-foreground">{profileSuccess}</div>
              )}

              <div className="surface rounded-xl p-6">
                <div className="mb-6 flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                    {user?.name?.charAt(0).toUpperCase() || <User className="size-6" />}
                  </span>
                  <div>
                    <p className="font-medium">{user?.name}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Name</Label>
                    <Input id="profile-name" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input id="profile-email" type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} placeholder="you@company.test" />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveProfile} disabled={profileSaving || !profileName || !profileEmail}>
                      {profileSaving && <Loader2 className="size-4 animate-spin" />}
                      <Save className="size-4" />
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>

              {/* Change Password */}
              <div className="rounded-xl border p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Change Password</h3>
                    <p className="mt-1 text-sm text-muted-foreground max-w-md">
                      Update your account password.
                    </p>
                  </div>
                </div>

                {pwError && (
                  <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{pwError}</div>
                )}
                {pwSuccess && (
                  <div className="mt-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success-foreground">{pwSuccess}</div>
                )}

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pw-current">Current Password</Label>
                    <Input id="pw-current" type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="Enter current password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-new">New Password</Label>
                    <Input id="pw-new" type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="At least 6 characters" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-confirm">Confirm New Password</Label>
                    <Input id="pw-confirm" type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="Re-enter new password" />
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button onClick={handleChangePassword} disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}>
                      {pwSaving && <Loader2 className="size-4 animate-spin" />}
                      <KeyRound className="size-4" />
                      Change Password
                    </Button>
                  </div>
                </div>
              </div>

              {/* Delete Account */}
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-destructive">Delete Account</h3>
                    <p className="mt-1 text-sm text-muted-foreground max-w-md">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteAcctDialogOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              <Dialog open={deleteAcctDialogOpen} onOpenChange={setDeleteAcctDialogOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="size-5" />
                      Delete Account
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      This will permanently delete your account, all workspaces you own, and all associated data. This action cannot be undone.
                    </p>
                    <p className="text-sm font-medium">Enter your password to confirm:</p>
                    <Input
                      type="password"
                      value={deleteAcctPassword}
                      onChange={e => setDeleteAcctPassword(e.target.value)}
                      placeholder="Your password"
                      onKeyDown={e => { if (e.key === "Enter" && deleteAcctPassword && !deleteAcctLoading) handleDeleteAccount(); }}
                    />
                    {deleteAcctError && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteAcctError}</div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setDeleteAcctDialogOpen(false); setDeleteAcctPassword(""); setDeleteAcctError(null); }}>Cancel</Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!deleteAcctPassword || deleteAcctLoading}
                        onClick={handleDeleteAccount}
                      >
                        {deleteAcctLoading && <Loader2 className="size-3.5 animate-spin" />}
                        Permanently Delete
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {activeTab === "workspace" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Workspace</h2>
                <p className="text-sm text-muted-foreground">Configure workspace settings, LLM providers, and report templates.</p>

              {/* Workspace sub-navigation */}
              <div className="flex gap-1 border-b border-border pb-1 mb-6 mt-2">
                <button
                  type="button"
                  onClick={() => { setSearchParams({ tab: activeTab, ws: "general" }); }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    workspaceTab === "general"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => { setSearchParams({ tab: activeTab, ws: "llm" }); }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    workspaceTab === "llm"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  LLM Providers
                </button>
                <button
                  type="button"
                  onClick={() => { setSearchParams({ tab: activeTab, ws: "report-template" }); }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    workspaceTab === "report-template"
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  Report Template
                </button>
              </div>
              </div>

              {workspaceTab === "general" && (
              <div className="space-y-6">
              <div className="space-y-6">
              </div>
              <div className="surface rounded-xl p-6">
                <div className="mb-6 flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
                    {activeWorkspace?.name?.charAt(0).toUpperCase() || "W"}
                  </span>
                  <div>
                    <p className="font-medium">{activeWorkspace?.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Hash className="size-3" />
                      <span className="font-mono">ID: {activeWorkspace?.id}</span>
                    </div>
                  </div>
                </div>

                {wsError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">{wsError}</div>
                )}
                {wsSuccess && (
                  <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success-foreground mb-4">{wsSuccess}</div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ws-name">Workspace name</Label>
                    <Input id="ws-name" value={wsName} onChange={e => setWsName(e.target.value)} placeholder="Workspace name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ws-desc">Description</Label>
                    <Input id="ws-desc" value={wsDescription} onChange={e => setWsDescription(e.target.value)} placeholder="Describe this workspace" />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveWorkspace} disabled={wsSaving || !wsName.trim()}>
                      {wsSaving && <Loader2 className="size-4 animate-spin" />}
                      <Save className="size-4" />
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>

              {/* Workspace ID info */}
              <div className="surface rounded-xl p-6">
                <h3 className="text-sm font-semibold mb-3">Workspace details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground">Workspace ID</span>
                    <span className="font-mono text-xs">{activeWorkspace?.id}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground">Slug</span>
                    <span className="font-mono text-xs">{activeWorkspace?.slug}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-muted-foreground">Active workspaces</span>
                    <span className="font-mono text-xs">{workspaces.length}</span>
                  </div>
                </div>
              </div>

              {/* SSH Key section */}
              <div className="surface rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold">SSH Key</h3>
                    <p className="text-xs text-muted-foreground">
                      This key is used to clone and fetch private repositories during collection.
                    </p>
                  </div>
                  {sshKeyLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </div>

                {sshKeyError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">{sshKeyError}</div>
                )}

                {sshKeyData ? (
                  <div className="space-y-4">
                    {/* Key Info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <span className="text-xs text-muted-foreground">Fingerprint</span>
                        <p className="font-mono text-xs mt-0.5 font-medium">{sshKeyData.fingerprint || "—"}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg px-3 py-2">
                        <span className="text-xs text-muted-foreground">Created</span>
                        <p className="text-xs mt-0.5 font-medium">{new Date(sshKeyData.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>

                    {/* Public Key */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs text-muted-foreground">Public Key</Label>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyPublicKey}>
                            {sshCopied ? <><Check className="size-3 mr-1" /> Copied</> : "Copy"}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleTestGitHub} disabled={sshTestLoading}>
                            {sshTestLoading ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                            Test GitHub
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={sshKeyData.publicKey}
                        readOnly
                        className="font-mono text-xs h-20 resize-none"
                      />
                    </div>

                    {/* Test Result */}
                    {sshTestResult && (
                      <div className={`rounded-lg border p-3 text-sm ${sshTestResult.success ? "border-success/20 bg-success/10 text-success-foreground" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
                        <p className="font-medium text-xs mb-1">{sshTestResult.success ? "✓" : "✗"} {sshTestResult.message}</p>
                        {sshTestResult.details && <p className="text-xs opacity-70 mt-1">{sshTestResult.details.slice(0, 300)}</p>}
                      </div>
                    )}

                    {/* Instructions */}
                    <div className="rounded-lg bg-muted/40 border border-border/60 p-4 text-xs text-muted-foreground space-y-1.5">
                      <p className="font-medium text-foreground">How to add to GitHub:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Go to your GitHub repository</li>
                        <li>Settings → Deploy Keys → Add deploy key</li>
                        <li>Title: <code className="bg-muted px-1 rounded text-[11px]">Monthly Report - {activeWorkspace?.name || "Workspace"}</code></li>
                        <li>Paste the public key above</li>
                        <li>Leave <strong>"Allow write access"</strong> unchecked</li>
                        <li>Click <strong>Add key</strong></li>
                      </ol>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleDeleteSshKey} className="text-destructive">
                        <Trash2 className="size-3 mr-1" /> Delete Key
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <KeyRound className="mx-auto size-8 text-muted-foreground/40" />
                    <p className="mt-2 text-sm font-medium text-muted-foreground">No SSH key configured</p>
                    <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                      Generate an SSH key to access private repositories during commit collection.
                    </p>
                    <div className="mt-4 flex justify-center">
                      <Button onClick={handleGenerateSshKey} disabled={sshGenerating} size="sm">
                        {sshGenerating ? <><Loader2 className="size-3 animate-spin mr-1" /> Generating...</> : <><KeyRound className="size-3 mr-1" /> Generate SSH Key</>}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Delete Workspace */}
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-destructive">Delete Workspace</h3>
                    <p className="mt-1 text-sm text-muted-foreground max-w-md">
                      Permanently delete this workspace and all associated data. This action cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteWsDialogOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              <Dialog open={deleteWsDialogOpen} onOpenChange={setDeleteWsDialogOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="size-5" />
                      Delete Workspace
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      This will permanently delete this workspace, including all repositories, collections, analyses, reports, and settings. This action cannot be undone.
                    </p>
                    <p className="text-sm font-medium">
                      Are you sure you want to delete <strong>{activeWorkspace?.name}</strong>?
                    </p>
                    {deleteWsError && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteWsError}</div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setDeleteWsDialogOpen(false); setDeleteWsError(null); }}>Cancel</Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteWsLoading}
                        onClick={handleDeleteWorkspace}
                      >
                        {deleteWsLoading && <Loader2 className="size-3.5 animate-spin" />}
                        Delete Workspace
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
              )}

              {workspaceTab === "llm" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">LLM Providers</h2>
                    <p className="text-sm text-muted-foreground">Configure AI models for commit analysis and report generation.</p>
                  </div>
                  <Button size="sm" onClick={() => openLlmForm()}><Plus className="h-3 w-3" /> Add Provider</Button>
                </div>

                {providers.length === 0 ? (
                  <div className="surface rounded-xl px-6 py-14 text-center">
                    <Bot className="mx-auto size-9 text-muted-foreground/50" />
                    <h3 className="mt-4 font-semibold">No providers configured</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Add an OpenAI-compatible provider to enable analysis.</p>
                    <Button className="mt-5" size="sm" onClick={() => openLlmForm()}><Plus className="h-3 w-3" /> Add Provider</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {providers.map(p => (
                      <div key={p.id} className="surface rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{p.name}</span>
                              <Badge variant="secondary" className="text-xs">{p.model}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.baseUrl}</p>
                          </div>
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openLlmForm(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteLlm(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <Dialog open={llmDialogOpen} onOpenChange={setLlmDialogOpen}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{editingLlm ? "Edit Provider" : "Add Provider"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Provider Name</Label>
                        <Input value={llmForm.name} onChange={e => setLlmForm({...llmForm, name: e.target.value})} placeholder="My LLM" />
                      </div>
                      <div>
                        <Label>Base URL</Label>
                        <Input value={llmForm.baseUrl} onChange={e => setLlmForm({...llmForm, baseUrl: e.target.value})} placeholder="https://api.openai.com/v1" />
                      </div>
                      <div>
                        <Label>API Key</Label>
                        <Input type="password" value={llmForm.apiKey} onChange={e => setLlmForm({...llmForm, apiKey: e.target.value})} placeholder="sk-..." />
                      </div>
                      <div>
                        <Label>Model</Label>
                        <Input value={llmForm.model} onChange={e => setLlmForm({...llmForm, model: e.target.value})} placeholder="gpt-4o-mini" />
                      </div>
                      {testResult && (
                        <div className={`rounded-lg border p-3 text-sm ${testResult.startsWith("✓") ? "border-success/20 bg-success/10 text-success-foreground" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
                          {testResult}
                        </div>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" size="sm" onClick={handleTest} disabled={!llmForm.apiKey}>Test Connection</Button>
                        <Button variant="outline" size="sm" onClick={() => setLlmDialogOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveLlm} disabled={savingLlm || !llmForm.baseUrl || !llmForm.apiKey || !llmForm.model}>
                          {savingLlm ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {editingLlm ? "Update" : "Save"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              )}

              {workspaceTab === "report-template" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Report Template</h2>
                  <p className="text-sm text-muted-foreground">Customize the markdown template used for generated reports.</p>
                </div>
                <div className="surface rounded-xl px-6 py-16 text-center">
                  <FileText className="mx-auto size-10 text-muted-foreground/40" />
                  <h3 className="mt-4 font-semibold">Coming soon</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
                    Report templates will be available in a future update. You'll be able to design custom templates for your monthly reports.
                  </p>
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
