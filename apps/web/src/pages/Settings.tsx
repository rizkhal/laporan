import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { apiFetch } from "../lib/utils";
import { Plus, Pencil, Trash2, Loader2, Bot } from "lucide-react";

interface LLMProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);
  const [editingLlm, setEditingLlm] = useState<LLMProvider | null>(null);
  const [llmForm, setLlmForm] = useState({ name: "", baseUrl: "", apiKey: "", model: "" });
  const [savingLlm, setSavingLlm] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadProviders().then(() => setLoading(false)); }, []);

  async function loadProviders() {
    const data = await apiFetch<LLMProvider[]>("/settings/llm");
    setProviders(data);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage LLM providers</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              LLM Providers
            </CardTitle>
            <Button size="sm" onClick={() => openLlmForm()}><Plus className="h-3 w-3" /> Add Provider</Button>
          </div>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No LLM providers configured. Add one to enable analysis.</p>
          ) : (
            <div className="space-y-3">
              {providers.map(p => (
                <div key={p.id} className="flex items-start justify-between p-3 border rounded-lg">
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
              <div className={`rounded-lg border p-3 text-sm ${testResult.startsWith("✓") ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Monthly Dev Report v1.0<br />
            Built with Hono, React, Drizzle ORM, and SQLite.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
