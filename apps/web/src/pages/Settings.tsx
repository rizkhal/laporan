import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { apiFetch, cn } from "../lib/utils";
import { useAuth } from "../lib/auth";
import { Plus, Pencil, Trash2, Loader2, Bot, KeyRound, FileText, User, Save } from "lucide-react";

interface LLMProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

type SettingsTab = "profile" | "llm" | "private-key" | "report-template";

const settingsNav = [
  { id: "profile" as SettingsTab, label: "Profile", icon: User },
  { id: "llm" as SettingsTab, label: "LLM Providers", icon: Bot },
  { id: "private-key" as SettingsTab, label: "Private Key", icon: KeyRound },
  { id: "report-template" as SettingsTab, label: "Report Template", icon: FileText },
];

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  // Profile state
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // LLM state
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [llmDialogOpen, setLlmDialogOpen] = useState(false);
  const [editingLlm, setEditingLlm] = useState<LLMProvider | null>(null);
  const [llmForm, setLlmForm] = useState({ name: "", baseUrl: "", apiKey: "", model: "" });
  const [savingLlm, setSavingLlm] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setProfileName(user.name);
      setProfileEmail(user.email);
    }
    loadProviders().then(() => setLoading(false));
  }, [user]);

  async function loadProviders() {
    try {
      const data = await apiFetch<LLMProvider[]>("/settings/llm");
      setProviders(data);
    } catch {}
  }

  async function handleSaveProfile() {
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);
    try {
      await updateProfile({ name: profileName, email: profileEmail });
      setProfileSuccess("Profile updated successfully.");
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage system configuration</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Sidebar */}
        <nav className="flex shrink-0 flex-col gap-1 lg:w-56">
          {settingsNav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                activeTab === id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {activeTab === "profile" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
                <p className="text-sm text-muted-foreground">Manage your account details.</p>
              </div>

              {profileError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{profileError}</div>
              )}
              {profileSuccess && (
                <div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success-foreground">{profileSuccess}</div>
              )}

              <div className="surface rounded-xl p-6">
                <div className="mb-6 flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                    {user?.name?.charAt(0).toUpperCase() || <User className="size-6" />}
                  </span>
                  <div>
                    <p className="font-medium">{user?.name}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Name</Label>
                    <Input id="profile-name" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input id="profile-email" type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} placeholder="you@company.test" />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveProfile} disabled={profileSaving || !profileName || !profileEmail}>
                      {profileSaving && <Loader2 className="size-4 animate-spin" />}
                      <Save className="size-4" />
                      Save changes
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "llm" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">LLM Providers</h2>
                  <p className="text-sm text-muted-foreground">Configure AI models for commit analysis and report generation.</p>
                </div>
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
                      <Input type="password" value={llmForm.apiKey} onChange={e => setLlmForm({...llmForm, apiKey: e.target.value})} placeholder="sk-..." />
                    </div>
                    <div>
                      <Label>Model</Label>
                      <Input value={llmForm.model} onChange={e => setLlmForm({...llmForm, model: e.target.value})} placeholder="gpt-4o-mini" />
                    </div>
                    {testResult && (
                      <div className={`rounded-lg border p-3 text-sm ${testResult.startsWith("✓") ? "border-success/20 bg-success/10 text-success-foreground" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
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
          )}

          {activeTab === "private-key" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Private Key</h2>
                <p className="text-sm text-muted-foreground">Manage SSH keys for private repository access.</p>
              </div>
              <div className="surface rounded-xl px-6 py-16 text-center">
                <KeyRound className="mx-auto size-10 text-muted-foreground/40" />
                <h3 className="mt-4 font-semibold">Coming soon</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
                  Private key management will be available in a future update. You'll be able to store SSH keys for accessing private repositories during collection.
                </p>
              </div>
            </div>
          )}

          {activeTab === "report-template" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Report Template</h2>
                <p className="text-sm text-muted-foreground">Customize the markdown template used for generated reports.</p>
              </div>
              <div className="surface rounded-xl px-6 py-16 text-center">
                <FileText className="mx-auto size-10 text-muted-foreground/40" />
                <h3 className="mt-4 font-semibold">Coming soon</h3>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
                  Report templates will be available in a future update. You'll be able to design custom templates for your monthly reports.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
