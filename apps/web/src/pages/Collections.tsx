import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { apiFetch } from "../lib/utils";
import { ArrowRight, Calendar, FileText, GitBranch, GitCommit, Info, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";

interface Category {
  id: number; name: string; color: string;
}
interface Collection {
  id: number; year: number; month: number; title: string; status: string; createdAt: string; repoIds: number[] | string | null; categoryId: number | null; category?: Category | null;
}
interface Repo { id: number; name: string; localPath: string; }
interface Stats { totalCommits?: number; totalFiles?: number; totalInsertions?: number; totalDeletions?: number; }
interface RepoStats { repoId: number; repoName: string; commits: number; insertions: number; deletions: number; }

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);
  const [selectedRepoIds, setSelectedRepoIds] = useState<number[] | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [editRepoIds, setEditRepoIds] = useState<number[] | null>(null);
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewMode = (searchParams.get("view") === "by-repo" ? "by-repo" : "timeline") as "timeline" | "by-repo" | "by-category";
  const [repoStatsMap, setRepoStatsMap] = useState<Record<number, RepoStats[]>>({});

  // Category management state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", color: "#6366f1" });
  const [catSaving, setCatSaving] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [collectionData, repoData, catData] = await Promise.all([
          apiFetch<Collection[]>("/collections"),
          apiFetch<Repo[]>("/repos"),
          apiFetch<Category[]>("/categories").catch(() => []),
        ]);
        setCollections(collectionData);
        setRepos(repoData);
        setCategories(catData);
        const pairs = await Promise.all(collectionData.slice(0, 8).map(async (collection) => [
          collection.id,
          await apiFetch<Stats>(`/collections/${collection.id}/stats`).catch(() => ({})),
        ] as const));
        setStats(Object.fromEntries(pairs));

        // Load per-repo stats for each collection
        const repoPairs = await Promise.all(collectionData.map(async (c) => {
          try {
            const data = await apiFetch<RepoStats[]>(`/collections/${c.id}/repo-stats`);
            return [c.id, data] as const;
          } catch { return [c.id, []] as const; }
        }));
        setRepoStatsMap(Object.fromEntries(repoPairs));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function loadCategories() {
    try {
      const data = await apiFetch<Category[]>("/categories");
      setCategories(data);
    } catch {}
  }

  async function handleCreate() {
    try {
      setCreating(true);
      const body: { year: number; month: number; repoIds?: number[]; categoryId?: number | null } = { year, month };
      if (selectedRepoIds?.length) body.repoIds = selectedRepoIds;
      if (selectedCategoryId) body.categoryId = selectedCategoryId;
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
    setEditCategoryId(collection.categoryId);
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editingCollection) return;
    try {
      setEditing(true);
      await apiFetch(`/collections/${editingCollection.id}`, {
        method: "PUT",
        body: JSON.stringify({ repoIds: editRepoIds, categoryId: editCategoryId }),
      });
      setCollections((items) => items.map((item) =>
        item.id === editingCollection.id ? { ...item, repoIds: editRepoIds, categoryId: editCategoryId } : item
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

  // Category CRUD
  function openCreateCat() {
    setEditingCat(null);
    setCatForm({ name: "", color: "#6366f1" });
    setCatDialogOpen(true);
  }

  async function handleSaveCat() {
    if (!catForm.name.trim()) return;
    try {
      setCatSaving(true);
      if (editingCat) {
        await apiFetch(`/categories/${editingCat.id}`, {
          method: "PUT", body: JSON.stringify(catForm),
        });
      } else {
        await apiFetch("/categories", {
          method: "POST", body: JSON.stringify(catForm),
        });
      }
      setCatDialogOpen(false);
      await loadCategories();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCatSaving(false);
    }
  }

  async function handleDeleteCat(id: number) {
    if (!confirm("Delete this category? Collections using it will be uncategorized.")) return;
    try {
      await apiFetch(`/categories/${id}`, { method: "DELETE" });
      await loadCategories();
      // Refresh collections since categories changed
      const collectionData = await apiFetch<Collection[]>("/collections");
      setCollections(collectionData);
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
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Collection timeline</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Each reporting period captures repository activity before analysis begins.</p>
          <div className="mt-4 flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 w-fit">
            <button type="button" onClick={() => setSearchParams({ view: "timeline" })} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "timeline" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Timeline
            </button>
            <button type="button" onClick={() => setSearchParams({ view: "by-repo" })} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "by-repo" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              By repository
            </button>
            <button type="button" onClick={() => setSearchParams({ view: "by-category" })} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "by-category" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              By category
            </button>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button onClick={() => { setSelectedRepoIds(null); setSelectedCategoryId(null); }}><Plus className="size-4" /> New collection</Button></DialogTrigger>
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

              {/* Category selector */}
              <div className="space-y-2">
                <Label>Category</Label>
                <select value={selectedCategoryId ?? ""} onChange={(e) => setSelectedCategoryId(e.target.value ? parseInt(e.target.value) : null)} className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 dark:border-white/[0.09] dark:bg-white/[0.035]">
                  <option value="">No category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
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

      {/* Category management bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map((cat) => (
          <span key={cat.id} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: cat.color + "40", backgroundColor: cat.color + "10", color: cat.color }}>
            <span className="size-2 rounded-full" style={{ backgroundColor: cat.color }} />
            {cat.name}
            <button type="button" onClick={() => { setEditingCat(cat); setCatForm({ name: cat.name, color: cat.color }); setCatDialogOpen(true); }} className="ml-0.5 opacity-50 hover:opacity-100">
              <Pencil className="size-3" />
            </button>
            <button type="button" onClick={() => handleDeleteCat(cat.id)} className="opacity-50 hover:opacity-100">
              <Trash2 className="size-3" />
            </button>
          </span>
        ))}
        <Button variant="outline" size="sm" onClick={openCreateCat} className="gap-1 text-xs">
          <Plus className="size-3" /> Category
        </Button>
      </div>

      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/8 p-4 text-sm text-destructive">{error}</div>}

      {collections.length === 0 ? (
        <div className="surface rounded-xl px-6 py-16 text-center">
          <Calendar className="mx-auto size-9 text-muted-foreground/50" />
          <h2 className="mt-4 font-semibold">No collection history</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create a reporting period to collect the first set of commits.</p>
          <Button className="mt-5" onClick={() => setDialogOpen(true)}><Plus /> Create collection</Button>
        </div>
      ) : viewMode === "by-repo" ? (
        <RepoGroupView
          collections={collections}
          repos={repos}
          repoStatsMap={repoStatsMap}
          statusVariant={statusVariant}
          months={months}
          navigate={navigate}
          onEdit={handleEditCollection}
          onDelete={handleDelete}
        />
      ) : viewMode === "by-category" ? (
        <CategoryGroupView
          collections={collections}
          categories={categories}
          repoStatsMap={repoStatsMap}
          statusVariant={statusVariant}
          months={months}
          navigate={navigate}
          onEdit={handleEditCollection}
          onDelete={handleDelete}
        />
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
                        {collection.category && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: collection.category.color + "40", backgroundColor: collection.category.color + "10", color: collection.category.color }}>
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: collection.category.color }} />
                            {collection.category.name}
                          </span>
                        )}
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

            {/* Category selector in edit */}
            <div className="space-y-2">
              <Label>Category</Label>
              <select value={editCategoryId ?? ""} onChange={(e) => setEditCategoryId(e.target.value ? parseInt(e.target.value) : null)} className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/25 dark:border-white/[0.09] dark:bg-white/[0.035]">
                <option value="">No category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

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

      {/* Category create/edit dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>{editingCat ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="e.g., Dashboard" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} className="size-9 cursor-pointer rounded-lg border border-input bg-card p-0.5" />
                <span className="font-mono text-xs text-muted-foreground">{catForm.color}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveCat} disabled={catSaving || !catForm.name.trim()}>
                {catSaving && <Loader2 className="animate-spin" />} {editingCat ? "Update" : "Create"}
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

function CategoryGroupView({
  collections,
  categories,
  repoStatsMap,
  statusVariant,
  months,
  navigate,
  onEdit,
  onDelete,
}: {
  collections: Collection[];
  categories: Category[];
  repoStatsMap: Record<number, RepoStats[]>;
  statusVariant: Record<string, string>;
  months: string[];
  navigate: (path: string) => void;
  onEdit: (c: Collection) => void;
  onDelete: (e: React.MouseEvent, id: number) => void;
}) {
  // Group collections by category
  const grouped = new Map<string, { category: Category | null; collections: Collection[] }>();

  // Uncategorized
  grouped.set("__uncategorized", { category: null, collections: [] });

  for (const cat of categories) {
    grouped.set(`cat_${cat.id}`, { category: cat, collections: [] });
  }

  for (const c of collections) {
    const key = c.categoryId ? `cat_${c.categoryId}` : "__uncategorized";
    const group = grouped.get(key);
    if (group) {
      group.collections.push(c);
    } else {
      grouped.set(key, { category: c.category || null, collections: [c] });
    }
  }

  // Filter out empty groups
  const entries = [...grouped.entries()].filter(([, g]) => g.collections.length > 0);

  // Sort: categories with names first, then uncategorized
  entries.sort((a, b) => {
    const aName = a[1].category?.name || "";
    const bName = b[1].category?.name || "";
    if (!aName && !bName) return 0;
    if (!aName) return 1;
    if (!bName) return -1;
    return aName.localeCompare(bName);
  });

  return (
    <div className="space-y-8">
      {entries.map(([key, group]) => (
        <div key={key}>
          <div className="mb-4 flex items-center gap-2">
            {group.category ? (
              <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: group.category.color + "40", backgroundColor: group.category.color + "10", color: group.category.color }}>
                <span className="size-2.5 rounded-full" style={{ backgroundColor: group.category.color }} />
                {group.category.name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Tag className="size-4" /> Uncategorized
              </span>
            )}
            <span className="text-xs text-muted-foreground">{group.collections.length} collection{group.collections.length > 1 ? "s" : ""}</span>
          </div>

          <div className="relative space-y-4 before:absolute before:bottom-8 before:left-5 before:top-8 before:w-px before:bg-border sm:before:left-7">
            {group.collections.map((collection, index) => {
              const collectionStats = repoStatsMap[collection.id]?.reduce((s, r) => ({ commits: s.commits + r.commits, insertions: s.insertions + r.insertions, deletions: s.deletions + r.deletions }), { commits: 0, insertions: 0, deletions: 0 }) || { commits: 0, insertions: 0, deletions: 0 };
              const progress = collection.status === "generated" ? 100 : collection.status === "analyzed" || collection.status === "generating" ? 72 : collection.status === "completed" || collection.status === "analyzing" ? 42 : 12;
              return (
                <article key={collection.id} className="relative pl-12 sm:pl-16">
                  <span className={`absolute left-[14px] top-7 z-10 size-3 rounded-full border-[3px] border-background sm:left-[22px] ${index === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  <button type="button" onClick={() => navigate(`/collections/${collection.id}`)} className="surface group w-full rounded-xl p-5 text-left transition-[border-color,transform] hover:border-primary/30 sm:p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                      <div className="min-w-0 lg:w-64">
                        <div className="flex items-center gap-2">
                          <Badge variant={statusVariant[collection.status] as any}>{collection.status}</Badge>
                        </div>
                        <h2 className="mt-3 truncate text-lg font-semibold tracking-[-0.025em]">{collection.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">{months[collection.month - 1]} {collection.year}</p>
                      </div>
                      <div className="grid flex-1 grid-cols-3 gap-4">
                        <Metric icon={GitCommit} label="Commits" value={collectionStats.commits || 0} />
                        <div>
                          <p className="text-xs text-muted-foreground">Code volume</p>
                          <p className="mt-1 font-mono text-sm font-semibold">
                            <span className="text-success-foreground">+{collectionStats.insertions || 0}</span>
                            <span className="ml-2 text-destructive">-{collectionStats.deletions || 0}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 lg:w-24">
                        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        <span onClick={(e) => { e.stopPropagation(); onEdit(collection); }} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="size-3.5" /></span>
                        <span onClick={(e) => onDelete(e, collection.id)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></span>
                      </div>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RepoGroupView({
  collections,
  repos,
  repoStatsMap,
  statusVariant,
  months,
  navigate,
  onEdit,
  onDelete,
}: {
  collections: Collection[];
  repos: Repo[];
  repoStatsMap: Record<number, RepoStats[]>;
  statusVariant: Record<string, string>;
  months: string[];
  navigate: (path: string) => void;
  onEdit: (c: Collection) => void;
  onDelete: (e: React.MouseEvent, id: number) => void;
}) {
  // Build repo -> collections map
  const repoCollections = new Map<number, { repo: Repo; collections: { collection: Collection; stats?: RepoStats }[] }>();

  for (const repo of repos) {
    const colls = collections
      .filter((c) => !c.repoIds || (Array.isArray(c.repoIds) ? c.repoIds : JSON.parse(c.repoIds as string)).includes(repo.id))
      .map((c) => ({
        collection: c,
        stats: repoStatsMap[c.id]?.find((s) => s.repoId === repo.id),
      }))
      .sort((a, b) => {
        const dateA = b.collection.year * 12 + b.collection.month;
        const dateB = a.collection.year * 12 + a.collection.month;
        return dateB - dateA;
      });
    if (colls.length > 0) {
      repoCollections.set(repo.id, { repo, collections: colls });
    }
  }

  const sortedRepos = [...repoCollections.values()].sort((a, b) => {
    const aLatest = a.collections[0]?.collection;
    const bLatest = b.collections[0]?.collection;
    const aDate = aLatest ? aLatest.year * 12 + aLatest.month : 0;
    const bDate = bLatest ? bLatest.year * 12 + bLatest.month : 0;
    return bDate - aDate;
  });

  return (
    <div className="relative space-y-4 before:absolute before:bottom-8 before:left-5 before:top-8 before:w-px before:bg-border sm:before:left-7">
      {sortedRepos.map(({ repo, collections: colls }, index) => {
        const totalCommits = colls.reduce((s, c) => s + (c.stats?.commits || 0), 0);
        const totalInsertions = colls.reduce((s, c) => s + (c.stats?.insertions || 0), 0);
        const totalDeletions = colls.reduce((s, c) => s + (c.stats?.deletions || 0), 0);
        return (
          <article key={repo.id} className="relative pl-12 sm:pl-16">
            <span className={`absolute left-[14px] top-7 z-10 size-3 rounded-full border-[3px] border-background sm:left-[22px] ${index === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
            <div className="surface w-full rounded-xl p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-4 text-primary" />
                    <h3 className="truncate text-lg font-semibold">{repo.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {colls.length} collection{colls.length > 1 ? "s" : ""} • {totalCommits} total commit{totalCommits !== 1 ? "s" : ""}
                    <span className="ml-2 text-success-foreground">+{totalInsertions}</span>
                    <span className="ml-1 text-destructive">-{totalDeletions}</span>
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {colls.map(({ collection: c, stats }) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/collections/${c.id}`)}
                    className="group flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-left transition-all hover:border-border hover:bg-muted/60"
                  >
                    <Badge variant={statusVariant[c.status] as any} className="shrink-0">{c.status}</Badge>
                    <span className="min-w-0 truncate text-sm font-medium">{c.title}</span>
                    {stats && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {stats.commits} commit{stats.commits !== 1 ? "s" : ""}
                        <span className="ml-1.5 text-success-foreground">+{stats.insertions}</span>
                        <span className="ml-1 text-destructive">-{stats.deletions}</span>
                      </span>
                    )}
                    {!stats && <span className="ml-auto text-xs text-muted-foreground">No commits</span>}
                    <span className="flex items-center gap-1 shrink-0 ml-2">
                      <span onClick={(e) => { e.stopPropagation(); onEdit(c); }} className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted group-hover:opacity-100"><Pencil className="size-3" /></span>
                      <span onClick={(e) => onDelete(e, c.id)} className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"><Trash2 className="size-3" /></span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
