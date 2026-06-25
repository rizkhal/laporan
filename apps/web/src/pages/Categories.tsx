import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { apiFetch } from "../lib/utils";
import { Plus, Pencil, Trash2, Loader2, FolderTree } from "lucide-react";

interface Category {
  id: number;
  name: string;
}

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCats(); }, []);

  async function loadCats() {
    try {
      setLoading(true);
      const data = await apiFetch<Category[]>("/categories");
      setCats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openForm(cat?: Category) {
    setEditingCat(cat || null);
    setForm(cat ? { name: cat.name } : { name: "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      setSaving(true);
      if (editingCat) {
        await apiFetch(`/categories/${editingCat.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await apiFetch("/categories", { method: "POST", body: JSON.stringify(form) });
      }
      await loadCats();
      setDialogOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this category?")) return;
    await apiFetch(`/categories/${id}`, { method: "DELETE" });
    await loadCats();
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
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">Manage repository categories</p>
        </div>
        <Button onClick={() => openForm()}><Plus className="h-4 w-4" /> Add Category</Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      {cats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderTree className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No categories</h3>
            <p className="text-muted-foreground mb-4">Add categories to organize your repositories.</p>
            <Button onClick={() => openForm()}><Plus className="h-4 w-4" /> Add Category</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {cats.map(c => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openForm(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Category Name</Label>
              <Input value={form.name} onChange={e => setForm({name: e.target.value})} placeholder="e.g., frontend" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.name}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {editingCat ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
