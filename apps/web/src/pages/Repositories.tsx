import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { apiFetch } from "../lib/utils";
import { Plus, Pencil, Trash2, GitBranch } from "lucide-react";

interface Repo {
  id: number;
  name: string;
  localPath: string;
  category: string;
  enabled: boolean;
  authorNames: string;
  authorEmails: string;
}

export default function Repositories() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState<Repo | null>(null);
  const [form, setForm] = useState({ name: "", localPath: "", category: "general", enabled: true, authorNames: "", authorEmails: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRepos(); }, []);

  async function loadRepos() {
    try {
      setLoading(true);
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
    setForm({ name: "", localPath: "", category: "general", enabled: true, authorNames: "", authorEmails: "" });
    setDialogOpen(true);
  }

  function openEdit(repo: Repo) {
    setEditingRepo(repo);
    setForm({
      name: repo.name,
      localPath: repo.localPath,
      category: repo.category,
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
        localPath: form.localPath,
        category: form.category,
        enabled: form.enabled,
        authorNames: form.authorNames.split("\n").map(s => s.trim()).filter(Boolean),
        authorEmails: form.authorEmails.split("\n").map(s => s.trim()).filter(Boolean),
      };

      if (editingRepo) {
        const updated = await apiFetch<Repo>(`/repos/${editingRepo.id}`, { method: "PUT", body: JSON.stringify(body) });
        setRepos(repos.map(r => r.id === updated.id ? updated : r));
      } else {
        const created = await apiFetch<Repo>("/repos", { method: "POST", body: JSON.stringify(body) });
        setRepos([...repos, created]);
      }
      setDialogOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this repository? This will also remove collected commits.")) return;
    try {
      await apiFetch(`/repos/${id}`, { method: "DELETE" });
      setRepos(repos.filter(r => r.id !== id));
    } catch (err: any) {
      setError(err.message);
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
          {repos.map(repo => (
            <Card key={repo.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {repo.name}
                      <Badge variant={repo.enabled ? "success" : "secondary"}>
                        {repo.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1 font-mono">{repo.localPath}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(repo)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(repo.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><strong>Category:</strong> {repo.category}</span>
                  <span><strong>Authors:</strong> {JSON.parse(repo.authorNames || "[]").length}</span>
                </div>
              </CardContent>
            </Card>
          ))}
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
              <Label>Local Path</Label>
              <Input value={form.localPath} onChange={e => setForm({...form, localPath: e.target.value})} placeholder="/path/to/repo" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="general" />
            </div>
            <div>
              <Label>Author Names (one per line)</Label>
              <Textarea value={form.authorNames} onChange={e => setForm({...form, authorNames: e.target.value})} placeholder="John Doe&#10;Jane Smith" rows={3} />
            </div>
            <div>
              <Label>Author Emails (one per line)</Label>
              <Textarea value={form.authorEmails} onChange={e => setForm({...form, authorEmails: e.target.value})} placeholder="john@example.com&#10;jane@example.com" rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="enabled" checked={form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})} className="rounded" />
              <Label htmlFor="enabled">Enabled</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name || !form.localPath}>
                {saving ? "Saving..." : editingRepo ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
