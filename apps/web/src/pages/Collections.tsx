import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { apiFetch } from "../lib/utils";
import { ArrowRight, Calendar, FileText, GitBranch, GitCommit, Info, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

interface Collection {
  id: number; year: number; month: number; title: string; status: string; createdAt: string; repoIds: number[] | string | null;
}
interface Repo { id: number; name: string; localPath: string; }
interface Stats { totalCommits?: number; totalFiles?: number; totalInsertions?: number; totalDeletions?: number; }

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const statusVariant: Record<string, "default" | "secondary" | "success" | "warning"> = {
  draft: "secondary", collecting: "default", completed: "default",
  analyzing: "warning", analyzed: "warning", generating: "warning", generated: "success",
};

function repoCount(value: Collection["repoIds"], fallback: number) {
  if (!value) return fallback;
  try { return (Array.isArray(value) ? value : JSON.parse(value)).length; } catch { return fallback; }
}

export default function Collections() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<Record<number, Stats>>({});
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);
  const [selectedRepoIds, setSelectedRepoIds] = useState<number[] | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [editRepoIds, setEditRepoIds] = useState<number[] | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [collectionData, repoData] = await Promise.all([
          apiFetch<Collection[]>("/collections"),
          apiFetch<Repo[]>("/repos"),
        ]);
        setCollections(collectionData);
        setRepos(repoData);
        const pairs = await Promise.all(collectionData.slice(0, 8).map(async (collection) => [
          collection.id,
          await apiFetch<Stats>(`/collections/${collection.id}/stats`).catch(() => ({})),
        ] as const));
        setStats(Object.fromEntries(pairs));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCreate() {
    try {
      setCreating(true);
      const body: { year: number; month: number; repoIds?: number[] } = { year, month };
      if (selectedRepoIds?.length) body.repoIds = selectedRepoIds;
      const collection = await apiFetch<Collection>("/collections", { method: "POST", body: JSON.stringify(body) });
      setDialogOpen(false);
      navigate(`/collections/${collection.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function handleEditCollection(collection: Collection) {
    const parsed = typeof collection.repoIds === "string"
      ? (() => { try { return JSON.parse(collection.repoIds); } catch { return null; } })()
      : collection.repoIds;
    setEditingCollection(collection);
    setEditRepoIds(parsed);
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editingCollection) return;
    try {
      setEditing(true);
      await apiFetch(`/collections/${editingCollection.id}`, {
        method: "PUT",
        body: JSON.stringify({ repoIds: editRepoIds }),
      });
      setCollections((items) => items.map((item) =>
        item.id === editingCollection.id ? { ...item, repoIds: editRepoIds } : item
      ));
      setEditDialogOpen(false);
      setEditingCollection(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditing(false);
    }
  }

  async function handleDelete(event: React.MouseEvent, id: number) {
    event.stopPropagation();
    if (!confirm("Delete this collection and all collected data?")) return;
    try {
      await apiFetch(`/collections/${id}`, { method: "DELETE" });
      setCollections((items) => items.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) {
    return <div className="space-y-5"><div className="skeleton h-10 w-64 rounded-lg" />{[1, 2, 3].map((item) => <div key={item} className="skeleton h-40 rounded-xl" />)}</div>;
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Git collection</p>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Collections</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Each reporting period captures repository activity before analysis begins.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button onClick={() => setSelectedRepoIds(null)}><Plus className="size-4" /> New collection</Button></DialogTrigger>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader><DialogTitle>Create collection</DialogTitle></DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Year</Label><Input type="number" value={year} onChange={(event) => setYear(parseInt(event.target.value) || new Date().getFullYear())} /></div>
                <div className="space-y-2">
                  <Label>Month</Label>
                  <select className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 dark:border-white/[0.09] dark:bg-white/[0.035]" value={month} onChange={(event) => setMonth(parseInt(event.target.value))}>
                    {months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Repositories</Label>
                <button type="button" onClick={() => setSelectedRepoIds(null)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selectedRepoIds === null ? "border-primary/40 bg-primary/5" : "hover:bg-muted"}`}>
                  <GitBranch className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">All enabled repositories</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{repos.length}</span>
                </button>
                <div className="grid max-h-52 gap-2 overflow-y-auto">
                  {repos.map((repo) => {
                    const checked = selectedRepoIds?.includes(repo.id) || false;
                    return (
                      <label key={repo.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
                        <input type="checkbox" checked={checked} onChange={() => setSelectedRepoIds((current) => current === null ? [repo.id] : checked ? current.filter((id) => id !== repo.id) : [...current, repo.id])} className="size-4 rounded border-input bg-card" />
                        <span className="text-sm">{repo.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || selectedRepoIds?.length === 0}>
                  {creating && <Loader2 className="animate-spin" />} Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-sm text-destructive">{error}</div>}

      {collections.length === 0 ? (
        <div className="surface rounded-xl px-6 py-16 text-center">
          <Calendar className="mx-auto size-9 text-muted-foreground/50" />
          <h2 className="mt-4 font-semibold">No collection history</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create a reporting period to collect the first set of commits.</p>
          <Button className="mt-5" onClick={() => setDialogOpen(true)}><Plus /> Create collection</Button>
        </div>
      ) : (
        <div className="relative space-y-4 before:absolute before:bottom-8 before:left-5 before:top-8 before:w-px before:bg-border sm:before:left-7">
          {collections.map((collection, index) => {
            const collectionStats = stats[collection.id] || {};
            const repositoryCount = repoCount(collection.repoIds, repos.length);
            const progress = collection.status === "generated" ? 100 : collection.status === "analyzed" || collection.status === "generating" ? 72 : collection.status === "completed" || collection.status === "analyzing" ? 42 : 12;
            return (
              <article key={collection.id} className="relative pl-12 sm:pl-16">
                <span className={`absolute left-[14px] top-7 z-10 size-3 rounded-full border-[3px] border-background sm:left-[22px] ${index === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                <button type="button" onClick={() => navigate(`/collections/${collection.id}`)} className="surface group w-full rounded-xl p-5 text-left transition-[border-color,transform] hover:border-primary/30 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                    <div className="min-w-0 lg:w-64">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant[collection.status] || "secondary"}>{collection.status}</Badge>
                        {index === 0 && <span className="text-xs font-medium text-primary">Current</span>}
                      </div>
                      <h2 className="mt-3 truncate text-lg font-semibold tracking-[-0.025em]">{collection.title}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">{months[collection.month - 1]} {collection.year}</p>
                    </div>

                    <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="relative">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><GitBranch className="size-3.5" /> Repositories <span className="group relative inline-flex"><Info className="size-3 cursor-pointer text-muted-foreground/60 hover:text-muted-foreground" /><div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-56 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg opacity-0 transition-opacity group-hover:opacity-100"><p className="text-xs font-medium text-foreground">{(collection.repoIds ? repos.filter((r) => (Array.isArray(collection.repoIds) ? collection.repoIds : JSON.parse(collection.repoIds as string)).includes(r.id)) : repos).slice(0, 15).map((r) => r.name).join(', ')}{repositoryCount > 15 ? ` +${repositoryCount - 15} more` : ''}</p></div></span></p>
                        <p className="mt-1 font-mono text-lg font-semibold">{repositoryCount}</p>
                      </div>
                      <Metric icon={GitCommit} label="Commits" value={collectionStats.totalCommits || 0} />
                      <Metric icon={FileText} label="Files changed" value={collectionStats.totalFiles || 0} />
                      <div>
                        <p className="text-xs text-muted-foreground">Code volume</p>
                        <p className="mt-1 font-mono text-sm font-semibold">
                          <span className="text-success-foreground">+{collectionStats.totalInsertions || 0}</span>
                          <span className="ml-2 text-destructive">-{collectionStats.totalDeletions || 0}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 lg:w-36">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
                      <span className="font-mono text-xs text-muted-foreground">{progress}%</span>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      <span onClick={(event) => { event.stopPropagation(); handleEditCollection(collection); }} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="size-3.5" /></span>
                      <span onClick={(event) => handleDelete(event, collection.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></span>
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Edit collection dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>Edit collection</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {editingCollection && (
              <p className="text-sm text-muted-foreground">
                Editing repositories for <strong>{editingCollection.title}</strong>
              </p>
            )}
            <button type="button" onClick={() => setEditRepoIds(null)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${editRepoIds === null ? "border-primary/40 bg-primary/5" : "hover:bg-muted"}`}>
              <GitBranch className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">All enabled repositories</span>
              <span className="ml-auto font-mono text-xs text-muted-foreground">{repos.length}</span>
            </button>
            <div className="grid max-h-52 gap-2 overflow-y-auto">
              {repos.map((repo) => {
                const checked = editRepoIds?.includes(repo.id) || false;
                return (
                  <label key={repo.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
                    <input type="checkbox" checked={checked} onChange={() => setEditRepoIds((current) => current === null ? [repo.id] : checked ? current.filter((id) => id !== repo.id) : [...current, repo.id])} className="size-4 rounded border-input bg-card" />
                    <span className="text-sm">{repo.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={editing || editRepoIds?.length === 0}>
                {editing && <Loader2 className="animate-spin" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof GitBranch; label: string; value: number }) {
  return <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" /> {label}</p><p className="mt-1 font-mono text-lg font-semibold">{value}</p></div>;
}
