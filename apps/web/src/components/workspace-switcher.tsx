import { useState, useRef, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  Check, ChevronDown, Plus, Search, Loader2, Building2,
} from "lucide-react";

export function WorkspaceSwitcher() {
  const {
    workspaces, activeWorkspace,
    switchWorkspace, createWorkspace,
  } = useAuth();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Click-outside handler
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    // Use setTimeout to avoid the trigger click immediately closing
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  // Focus search when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(query.toLowerCase())
  );

  async function handleSwitch(id: number) {
    if (id === activeWorkspace?.id) {
      setOpen(false);
      return;
    }
    await switchWorkspace(id);
    setOpen(false);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createWorkspace(newName.trim(), newDesc.trim() || null);
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
    } catch {}
    setSaving(false);
  }

  return (
    <>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted/70 dark:hover:bg-white/[0.05]"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
          {activeWorkspace?.name?.charAt(0).toUpperCase() || "W"}
        </span>
        <span className="hidden max-w-[140px] truncate sm:block">
          {activeWorkspace?.name || "Workspace"}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
      </button>

      {/* Dropdown */}
      <div
        ref={dropdownRef}
        className={cn(
          "fixed left-4 top-[60px] z-50 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-xl shadow-popover/15 transition-all duration-150 sm:left-auto sm:ml-1.5",
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
        style={{ transformOrigin: "top left" }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find workspace..."
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Workspace list */}
        <div className="max-h-56 overflow-y-auto p-1.5">
          <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspaces
          </p>
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No workspaces found
            </p>
          ) : (
            filtered.map((ws) => {
              const isActive = ws.id === activeWorkspace?.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSwitch(ws.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-primary/8 text-primary"
                      : "hover:bg-muted text-foreground",
                  )}
                >
                  <span className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-bold",
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}>
                    {ws.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ws.name}</p>
                    {ws.description && (
                      <p className="truncate text-xs text-muted-foreground">{ws.description}</p>
                    )}
                  </div>
                  {isActive && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-1.5">
          <button
            type="button"
            onClick={() => { setOpen(false); setCreateOpen(true); }}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="grid size-7 place-items-center rounded-md border border-dashed">
              <Plus className="size-3.5" />
            </span>
            Create workspace
          </button>
        </div>
      </div>

      {/* Create workspace dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Workspace name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Client Projects"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What is this workspace for?"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !newName.trim()}>
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
