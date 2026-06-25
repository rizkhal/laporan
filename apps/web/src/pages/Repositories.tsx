import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { apiFetch } from "../lib/utils";
import { useToast } from "../components/toast";
import { Plus, Pencil, Trash2, GitBranch, Link, Loader2, Check, X, RefreshCw, AlertTriangle } from "lucide-react";

interface Repo {
  id: number;
  name: string;
  localPath: string;
  remoteUrl: string;
  enabled: boolean;
  authorNames: string;
  authorEmails: string;
  cloneStatus: string;
  cloneError: string | null;
  lastClonedAt: string | null;
  lastSyncedAt: string | null;
}

const cloneStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive"; icon: typeof Loader2 | typeof Check | typeof X | typeof AlertTriangle | typeof GitBranch }> = {
  pending_clone: { label: "Pending Setup", variant: "secondary", icon: GitBranch },
  cloning: { label: "Cloning...", variant: "warning", icon: Loader2 },
  connected: { label: "Connected", variant: "success", icon: Check },
  failed: { label: "Failed", variant: "destructive", icon: X },
  syncing: { label: "Syncing...", variant: "warning", icon: Loader2 },
  testing: { label: "Connecting...", variant: "warning", icon: Loader2 },
};

export default function Repositories() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState<Repo | null>(null);
  const [form, setForm] = useState({ name: "", remoteUrl: "", enabled: true, authorNames: "", authorEmails: "" });
  const [saving, setSaving] = useState(false);

  // Test connection state
  const [testingId, setTestingId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({});

  // Auto-refresh polling for status updates
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const { addToast } = useToast();

  useEffect(() => {
    loadRepos();

    // Poll for status updates every 5s while there are pending/cloning repos
    const pollTimer = setInterval(() => {
      const hasActive = repos.some((r) =>
        r.cloneStatus === "pending_clone" || r.cloneStatus === "cloning" || r.cloneStatus === "syncing"
      );
      if (hasActive) {
        loadRepos();
      }
    }, 5000);

    return () => clearInterval(pollTimer);
  }, [repos]);

  async function loadRepos() {
    try {
      const data = await apiFetch<Repo[]>("/repos");
      setRepos(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingRepo(null);
    setForm({ name: "", remoteUrl: "", enabled: true, authorNames: "", authorEmails: "" });
    setDialogOpen(true);
  }

  function openEdit(repo: Repo) {
    setEditingRepo(repo);
    setForm({
      name: repo.name,
      remoteUrl: repo.remoteUrl,
      enabled: repo.enabled,
      authorNames: JSON.parse(repo.authorNames || "[]").join("\n"),
      authorEmails: JSON.parse(repo.authorEmails || "[]").join("\n"),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      setSaving(true);
      const body = {
        name: form.name,
        remoteUrl: form.remoteUrl,
        enabled: form.enabled,
        authorNames: form.authorNames.split("\n").map(s => s.trim()).filter(Boolean),
        authorEmails: form.authorEmails.split("\n").map(s => s.trim()).filter(Boolean),
      };

      if (editingRepo) {
        const updated = await apiFetch<Repo>(`/repos/${editingRepo.id}`, { method: "PUT", body: JSON.stringify(body) });
        setRepos(repos.map(r => r.id === updated.id ? updated : r));
        setDialogOpen(false);
        addToast({ type: "success", title: "Repository updated" });
      } else {
        // Create returns immediately with pending_clone status
        const created = await apiFetch<Repo>("/repos", { method: "POST", body: JSON.stringify(body) });
        setRepos([...repos, created]);
        setDialogOpen(false);
        addToast({ type: "success", title: "Repository added", description: "Clone started in background." });
      }
    } catch (err: any) {
      setError(err.message);
      addToast({ type: "error", title: "Failed to save repository", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this repository? This will also remove collected commits.")) return;
    try {
      await apiFetch(`/repos/${id}`, { method: "DELETE" });
      setRepos(repos.filter(r => r.id !== id));
      addToast({ type: "success", title: "Repository deleted" });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleRefresh(id: number) {
    setRefreshingId(id);
    try {
      const result = await apiFetch<{ success: boolean; message: string }>(`/repos/${id}/refresh`, { method: "POST" });
      if (!result.success) {
        setError(result.message);
        addToast({ type: "error", title: "Refresh failed", description: result.message });
      } else {
        addToast({ type: "success", title: "Refresh queued" });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleRetryClone(id: number) {
    setRetryingId(id);
    try {
      const result = await apiFetch<{ success: boolean; message: string }>(`/repos/${id}/retry-clone`, { method: "POST" });
      if (result.success) {
        // Update local state to show pending immediately
        setRepos(repos.map(r => r.id === id ? { ...r, cloneStatus: "pending_clone", cloneError: null } : r));
        addToast({ type: "success", title: "Clone retry queued" });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRetryingId(null);
    }
  }

  async function handleTestConnection(id: number) {
    setTestingId(id);
    setTestResults(prev => ({ ...prev, [id]: { success: false, message: "Testing..." } }));
    try {
      const result = await apiFetch<{ success: boolean; message: string; defaultBranch?: string }>(`/repos/${id}/test-connection`, { method: "POST" });
      setTestResults(prev => ({ ...prev, [id]: result }));
      if (result.success) {
        addToast({ type: "success", title: "Connection successful" });
      } else {
        addToast({ type: "error", title: "Connection failed", description: result.message });
      }
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, message: err.message } }));
    } finally {
      setTestingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
          <p className="text-muted-foreground">Manage your Git repositories</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Repository</Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      {repos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No repositories</h3>
            <p className="text-muted-foreground mb-4">Add a repository to start collecting commits.</p>
            <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Repository</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {repos.map(repo => {
            const isTesting = testingId === repo.id;
            const displayStatus = isTesting ? "testing" : repo.cloneStatus;
            const displayCfg = cloneStatusConfig[displayStatus] || cloneStatusConfig.pending_clone;
            const DisplayIcon = displayCfg.icon;

            return (
              <Card key={repo.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <span className="truncate">{repo.name}</span>
                        <Badge variant={displayCfg.variant} className="flex items-center gap-1 shrink-0">
                          {displayCfg.label === "Cloning..." || displayCfg.label === "Syncing..." || displayCfg.label === "Connecting..." ? (
                            <DisplayIcon className="size-3 animate-spin" />
                          ) : (
                            <DisplayIcon className="size-3" />
                          )}
                          {displayCfg.label}
                        </Badge>
                        {testResults[repo.id] && !isTesting && (
                          <Badge variant={testResults[repo.id].success ? "success" : "destructive"}>
                            {testResults[repo.id].success ? <Check className="size-2.5 mr-0.5" /> : <X className="size-2.5 mr-0.5" />}
                            {testResults[repo.id].success ? "Connected" : "Failed"}
                          </Badge>
                        )}
                        <Badge variant={repo.enabled ? "success" : "secondary"}>
                          {repo.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1 font-mono truncate">{repo.remoteUrl}</p>
                      {repo.cloneStatus === "connected" && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono truncate">{repo.localPath}</p>
                      )}
                      {repo.cloneStatus === "failed" && repo.cloneError && (
                        <p className="text-xs text-destructive mt-1">{repo.cloneError}</p>
                      )}
                      {testResults[repo.id] && !testResults[repo.id].success && !isTesting && (
                        <p className="text-xs text-destructive mt-1">{testResults[repo.id].message}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-3">
                      {repo.cloneStatus === "connected" && (
                        <Button variant="ghost" size="icon" onClick={() => handleRefresh(repo.id)} disabled={refreshingId === repo.id} title="Pull latest">
                          <RefreshCw className={`h-4 w-4 ${refreshingId === repo.id ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                      {repo.cloneStatus === "failed" && (
                        <Button variant="ghost" size="icon" onClick={() => handleRetryClone(repo.id)} disabled={retryingId === repo.id} title="Retry clone">
                          {retryingId === repo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleTestConnection(repo.id)} disabled={testingId === repo.id || repo.cloneStatus === "pending_clone" || repo.cloneStatus === "cloning"} title="Test connection">
                        {testingId === repo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(repo)} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(repo.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span><strong>Authors:</strong> {JSON.parse(repo.authorNames || "[]").length}</span>
                    {repo.lastClonedAt && (
                      <span className="text-muted-foreground">
                        <strong>Last cloned:</strong> {new Date(repo.lastClonedAt).toLocaleDateString()}
                      </span>
                    )}
                    {repo.lastSyncedAt && (
                      <span className="text-muted-foreground">
                        <strong>Last synced:</strong> {new Date(repo.lastSyncedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRepo ? "Edit Repository" : "Add Repository"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Repository Name</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g., frontend-app" />
            </div>
            <div>
              <Label>Git SSH URL</Label>
              <Input value={form.remoteUrl} onChange={e => setForm({...form, remoteUrl: e.target.value})} placeholder="git@github.com:owner/repo.git" />
            </div>

            <div>
              <Label>Author Names (one per line)</Label>
              <Textarea value={form.authorNames} onChange={e => setForm({...form, authorNames: e.target.value})} placeholder="Rina Pratama&#10;Daniel Cho" rows={3} />
            </div>
            <div>
              <Label>Author Emails (one per line)</Label>
              <Textarea value={form.authorEmails} onChange={e => setForm({...form, authorEmails: e.target.value})} placeholder="rina@company.test&#10;daniel@company.test" rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="enabled" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})} className="size-4 rounded border-input bg-card" />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name || !form.remoteUrl}>
                {saving ? "Saving..." : editingRepo ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
