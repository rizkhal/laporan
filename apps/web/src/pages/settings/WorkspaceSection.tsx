import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/label";
import { apiFetch } from "../../lib/utils";
import { Save, Loader2, Hash } from "lucide-react";

interface WorkspaceSectionProps {
  activeWorkspace: any;
  refreshWorkspaces: () => Promise<void>;
}

export function WorkspaceSection({ activeWorkspace, refreshWorkspaces }: WorkspaceSectionProps) {
  const [wsName, setWsName] = useState(() => localStorage.getItem("settings:wsName") || activeWorkspace?.name || "");
  const [wsDescription, setWsDescription] = useState(() => localStorage.getItem("settings:wsDescription") || activeWorkspace?.description || "");
  const [wsSaving, setWsSaving] = useState(false);
  const [wsSuccess, setWsSuccess] = useState<string | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">General</h2>
        <p className="text-sm text-muted-foreground">Configure workspace name and description.</p>
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

        {wsError && (<div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">{wsError}</div>)}
        {wsSuccess && (<div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success-foreground mb-4">{wsSuccess}</div>)}

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
              <Save className="size-4" /> Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
