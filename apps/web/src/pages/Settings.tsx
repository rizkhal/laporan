import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { apiFetch } from "../lib/utils";
import { Settings, CheckCircle2, Loader2 } from "lucide-react";

interface LLMSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export default function SettingsPage() {
  const [form, setForm] = useState<LLMSettings>({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const data = await apiFetch<LLMSettings>("/settings/llm");
      setForm({
        baseUrl: data.baseUrl || "https://api.openai.com/v1",
        apiKey: data.apiKey || "",
        model: data.model || "gpt-4o-mini",
      });
    } catch (err: any) {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);
      await apiFetch("/settings/llm", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    try {
      setTestResult("Testing...");
      const result = await apiFetch<{ success: boolean; content?: string; error?: string }>("/settings/llm/test", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (result.success) {
        setTestResult(`Connection successful! ✓ Response: "${result.content}"`);
      } else {
        setTestResult(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      setTestResult(`Error: ${err.message}`);
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
        <p className="text-muted-foreground">Configure LLM provider for analysis</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            LLM Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Base URL</Label>
            <Input value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})} placeholder="https://api.openai.com/v1" />
          </div>
          <div>
            <Label>API Key</Label>
            <Input type="password" value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})} placeholder="sk-..." />
          </div>
          <div>
            <Label>Model</Label>
            <Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="gpt-4o-mini" />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Settings
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={!form.apiKey}>
              Test Connection
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
          {testResult && (
            <div className={`text-sm p-2 rounded ${testResult.includes("successful") ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
              {testResult}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Monthly Dev Report v1.0<br />
            Built with Hono, React, Drizzle ORM, and SQLite.<br />
            Uses LLM (OpenAI-compatible API) for commit analysis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
