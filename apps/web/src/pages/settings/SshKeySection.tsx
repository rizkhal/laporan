import { useState, useCallback, useEffect } from "react";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { apiFetch } from "../../lib/utils";
import { KeyRound, Loader2, Trash2, Check } from "lucide-react";

interface SshKeySectionProps {
  activeWorkspace: any;
}

export function SshKeySection({ activeWorkspace }: SshKeySectionProps) {
  const [sshKeyData, setSshKeyData] = useState<{ id: number; name: string; publicKey: string; fingerprint: string | null; createdAt: string } | null>(null);
  const [sshKeyLoading, setSshKeyLoading] = useState(false);
  const [sshKeyError, setSshKeyError] = useState<string | null>(null);
  const [sshTestResult, setSshTestResult] = useState<{ success: boolean; message: string; details: string } | null>(null);
  const [sshTestLoading, setSshTestLoading] = useState(false);
  const [sshGenerating, setSshGenerating] = useState(false);
  const [sshCopied, setSshCopied] = useState(false);

  const loadSshKey = useCallback(async () => {
    if (!activeWorkspace) return;
    setSshKeyLoading(true);
    setSshKeyError(null);
    try {
      const data = await apiFetch<{ id: number; name: string; publicKey: string; fingerprint: string | null; createdAt: string }>(`/workspaces/${activeWorkspace.id}/ssh-key`);
      setSshKeyData(data);
    } catch {
      setSshKeyData(null);
    } finally {
      setSshKeyLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { loadSshKey(); }, [loadSshKey]);

  async function handleGenerateSshKey() {
    if (!activeWorkspace) return;
    setSshGenerating(true);
    setSshKeyError(null);
    setSshTestResult(null);
    try {
      const result = await apiFetch<{ success: boolean; publicKey: string; fingerprint: string }>(`/workspaces/${activeWorkspace.id}/ssh-key/generate`, {
        method: "POST",
        body: JSON.stringify({ name: "default" }),
      });
      if (result.success) {
        setSshKeyData({ id: 0, name: "default", publicKey: result.publicKey, fingerprint: result.fingerprint, createdAt: new Date().toISOString() });
        setTimeout(() => loadSshKey(), 500);
      }
    } catch (err: any) {
      setSshKeyError(err.message);
    } finally {
      setSshGenerating(false);
    }
  }

  async function handleDeleteSshKey() {
    if (!activeWorkspace || !sshKeyData) return;
    if (!confirm("Delete this SSH key? This will break access to any repositories using this key.")) return;
    setSshKeyError(null);
    try {
      await apiFetch(`/workspaces/${activeWorkspace.id}/ssh-key`, { method: "DELETE" });
      setSshKeyData(null);
      setSshTestResult(null);
    } catch (err: any) {
      setSshKeyError(err.message);
    }
  }

  async function handleTestGitHub() {
    if (!activeWorkspace) return;
    setSshTestLoading(true);
    setSshTestResult(null);
    try {
      const result = await apiFetch<{ success: boolean; message: string; details: string }>(`/workspaces/${activeWorkspace.id}/ssh-key/test-github`, { method: "POST" });
      setSshTestResult(result);
    } catch (err: any) {
      setSshTestResult({ success: false, message: err.message, details: "" });
    } finally {
      setSshTestLoading(false);
    }
  }

  async function copyPublicKey() {
    if (!sshKeyData?.publicKey) return;
    try {
      await navigator.clipboard.writeText(sshKeyData.publicKey);
      setSshCopied(true);
      setTimeout(() => setSshCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">SSH Key</h2>
        <p className="text-sm text-muted-foreground">Manage SSH keys for repository access.</p>
      </div>
      <div className="surface rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">SSH Key</h3>
            <p className="text-xs text-muted-foreground">This key is used to clone and fetch private repositories during collection.</p>
          </div>
          {sshKeyLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        {sshKeyError && (<div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4">{sshKeyError}</div>)}

        {sshKeyData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-muted/50 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Fingerprint</span>
                <p className="font-mono text-xs mt-0.5 font-medium">{sshKeyData.fingerprint || "\u2014"}</p>
              </div>
              <div className="bg-muted/50 rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground">Created</span>
                <p className="text-xs mt-0.5 font-medium">{new Date(sshKeyData.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs text-muted-foreground">Public Key</Label>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyPublicKey}>
                    {sshCopied ? <><Check className="size-3 mr-1" /> Copied</> : "Copy"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleTestGitHub} disabled={sshTestLoading}>
                    {sshTestLoading ? <Loader2 className="size-3 animate-spin mr-1" /> : null} Test GitHub
                  </Button>
                </div>
              </div>
              <Textarea value={sshKeyData.publicKey} readOnly className="font-mono text-xs h-20 resize-none" />
            </div>

            {sshTestResult && (
              <div className={`rounded-lg border p-3 text-sm ${sshTestResult.success ? "border-success/20 bg-success/10 text-success-foreground" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
                <p className="font-medium text-xs mb-1">{sshTestResult.success ? "\u2713" : "\u2717"} {sshTestResult.message}</p>
                {sshTestResult.details && <p className="text-xs opacity-70 mt-1">{sshTestResult.details.slice(0, 300)}</p>}
              </div>
            )}

            <div className="rounded-lg bg-muted/40 border border-border/60 p-4 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">How to add to GitHub:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Go to your GitHub repository</li>
                <li>Settings → Deploy Keys → Add deploy key</li>
                <li>Title: <code className="bg-muted px-1 rounded text-[11px]">Monthly Report - {activeWorkspace?.name || "Workspace"}</code></li>
                <li>Paste the public key above</li>
                <li>Leave <strong>"Allow write access"</strong> unchecked</li>
                <li>Click <strong>Add key</strong></li>
              </ol>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDeleteSshKey} className="text-destructive">
                <Trash2 className="size-3 mr-1" /> Delete Key
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <KeyRound className="mx-auto size-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm font-medium text-muted-foreground">No SSH key configured</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">Generate an SSH key to access private repositories during commit collection.</p>
            <div className="mt-4 flex justify-center">
              <Button onClick={handleGenerateSshKey} disabled={sshGenerating} size="sm">
                {sshGenerating ? <><Loader2 className="size-3 animate-spin mr-1" /> Generating...</> : <><KeyRound className="size-3 mr-1" /> Generate SSH Key</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
