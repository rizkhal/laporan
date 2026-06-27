import { useState, useEffect, useCallback } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch } from "../../lib/utils";
import { Bot, Plus, Pencil, Trash2, Loader2, Eye, EyeOff } from "lucide-react";

interface LLMProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface LlmSectionProps {
  activeWorkspace: any;
}

export function LlmSection({ activeWorkspace }: LlmSectionProps) {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);
  const [editingLlm, setEditingLlm] = useState<LLMProvider | null>(null);
  const [llmForm, setLlmForm] = useState({ name: "", baseUrl: "", apiKey: "", model: "" });
  const [savingLlm, setSavingLlm] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const data = await apiFetch<LLMProvider[]>("/settings/llm");
      setProviders(data);
    } catch {}
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  function openLlmForm(provider?: LLMProvider) {
    setEditingLlm(provider || null);
    setLlmForm(provider
      ? { name: provider.name, baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }
      : { name: "", baseUrl: "https://router.example.com/v1", apiKey: "", model: "" }
    );
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
      setTestResult(result.success ? `\u2713 ${result.content?.slice(0, 100)}` : `\u2717 ${result.error}`);
    } catch (err: any) {
      setTestResult(`\u2717 ${err.message}`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">LLM Providers</h2>
        <p className="text-sm text-muted-foreground">Configure AI models for commit analysis and report generation.</p>
      </div>

      <div className="flex items-center justify-between">
        <div />
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
              <div className="relative">
                <Input type={showApiKey ? "text" : "password"} value={llmForm.apiKey} onChange={e => setLlmForm({...llmForm, apiKey: e.target.value})} placeholder="sk-..." className="pr-10" />
                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Model</Label>
              <Input value={llmForm.model} onChange={e => setLlmForm({...llmForm, model: e.target.value})} placeholder="gpt-4o-mini" />
            </div>
            {testResult && (
              <div className={`rounded-lg border p-3 text-sm ${testResult.startsWith("\u2713") ? "border-success/20 bg-success/10 text-success-foreground" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
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
  );
}
