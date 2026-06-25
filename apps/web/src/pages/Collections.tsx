import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { apiFetch } from "../lib/utils";
import { Calendar, Plus, ArrowRight, Trash2, Loader2, GitBranch, CheckSquare, Square } from "lucide-react";

interface Collection {
  id: number;
  year: number;
  month: number;
  title: string;
  status: string;
  createdAt: string;
  repoIds: number[] | null;
}

interface Repo {
  id: number;
  name: string;
  localPath: string;
  category: string;
}

const statusVariant: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  collecting: "secondary",
  completed: "default",
  analyzing: "warning",
  analyzed: "warning",
  generating: "warning",
  generated: "success",
};

export default function Collections() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepoIds, setSelectedRepoIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(true);

  useEffect(() => { loadCollections(); loadRepos(); }, []);

  async function loadRepos() {
    try {
      const data = await apiFetch<Repo[]>("/repos");
      setRepos(data);
    } catch {}
  }

  async function loadCollections() {
    try {
      setLoading(true);
      const data = await apiFetch<Collection[]>("/collections");
      setCollections(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      setCreating(true);
      const body: any = { year, month };
      // Send repoIds only if specific repos selected
      if (!selectAll && selectedRepoIds.length > 0) {
        body.repoIds = selectedRepoIds;
      }
      const col = await apiFetch<Collection>("/collections", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCollections([col, ...collections]);
      setDialogOpen(false);
      navigate(`/collections/${col.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this collection and all its data?")) return;
    try {
      await apiFetch(`/collections/${id}`, { method: "DELETE" });
      setCollections(collections.filter(c => c.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

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
          <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
          <p className="text-muted-foreground">Monthly commit collections</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setSelectAll(true); setSelectedRepoIds([]); }}><Plus className="h-4 w-4" /> New Collection</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Collection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Year</Label>
                <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || 2024)} />
              </div>
              <div>
                <Label>Month</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={month}
                  onChange={e => setMonth(parseInt(e.target.value))}
                >
                  {months.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Repository Selection */}
              <div>
                <Label>Repositories</Label>
                {repos.length > 0 && (
                  <div className="mt-1 space-y-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectAll}
                        onChange={() => {
                          setSelectAll(true);
                          setSelectedRepoIds([]);
                        }}
                      />
                      <span className="font-medium">All Repositories</span>
                    </label>
                    <div className="border-t pt-1.5 space-y-1">
                      {repos.map(repo => (
                        <label key={repo.id} className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors ml-4">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectAll || selectedRepoIds.includes(repo.id)}
                            disabled={selectAll}
                            onChange={() => {
                              setSelectAll(false);
                              setSelectedRepoIds(prev =>
                                prev.includes(repo.id)
                                  ? prev.filter(r => r !== repo.id)
                                  : [...prev, repo.id]
                              );
                            }}
                          />
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{repo.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {repos.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No repositories configured. Add one first.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || (!selectAll && selectedRepoIds.length === 0)}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      {collections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No collections yet</h3>
            <p className="text-muted-foreground mb-4">Create your first monthly collection to start tracking commits.</p>
            <Button onClick={() => { setDialogOpen(true); }}><Plus className="h-4 w-4" /> Create Collection</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {collections.map(col => (
            <Card key={col.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/collections/${col.id}`)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {months[col.month - 1].slice(0, 3)}
                  </div>
                  <div>
                    <p className="font-semibold">{col.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant={statusVariant[col.status] || "secondary"}>{col.status}</Badge>
                      <span className="text-xs text-muted-foreground">{col.createdAt}</span>
                      {col.repoIds && col.repoIds.length > 0 && (
                        <span className="text-xs text-muted-foreground">{col.repoIds.length} repos</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleDelete(col.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
