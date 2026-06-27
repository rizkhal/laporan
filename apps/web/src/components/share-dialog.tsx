import { useState, useEffect } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { apiFetch } from "../lib/utils";
import { Globe, Lock, Loader2, Share2, Clipboard, Check } from "lucide-react";
import { useToast } from "./toast";
import type { ShareInfo } from "../lib/types";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId: number;
  reportId: number;
}

export function ShareDialog({ open, onOpenChange, collectionId, reportId }: ShareDialogProps) {
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [shareVisibility, setShareVisibility] = useState<"public" | "protected">("public");
  const [sharePassword, setSharePassword] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    if (open && reportId) loadShareInfo();
  }, [open, reportId]);

  async function loadShareInfo() {
    try {
      const data = await apiFetch<ShareInfo | null>(`/reports/${collectionId}/share`);
      setShareInfo(data);
      if (data) {
        setShareVisibility(data.visibility as "public" | "protected");
      }
    } catch {}
  }

  async function handleShare() {
    try {
      setShareBusy(true);
      const data = await apiFetch<ShareInfo>(`/reports/${collectionId}/share`, {
        method: "POST",
        body: JSON.stringify({
          visibility: shareVisibility,
          password: shareVisibility === "protected" ? sharePassword : undefined,
        }),
      });
      setShareInfo(data);
      addToast({ type: "success", title: "Share link created" });
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to create share link", description: err.message });
    } finally {
      setShareBusy(false);
    }
  }

  async function handleDeleteShare() {
    try {
      setShareBusy(true);
      await apiFetch(`/reports/${collectionId}/share`, { method: "DELETE" });
      setShareInfo(null);
      setSharePassword("");
      addToast({ type: "success", title: "Share link deleted" });
    } catch (err: any) {
      addToast({ type: "error", title: "Failed to delete share link", description: err.message });
    } finally {
      setShareBusy(false);
    }
  }

  const shareUrl = shareInfo ? `${window.location.origin}/share/${shareInfo.slug}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Share report</DialogTitle>
          <DialogDescription className="text-xs">Create a public link to share this report with others.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {shareInfo ? (
            <>
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Share URL</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-muted px-2 py-1 font-mono text-xs">{shareUrl}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}>
                    {shareCopied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                {shareInfo.visibility === "protected" ? <Lock className="size-4 text-muted-foreground" /> : <Globe className="size-4 text-muted-foreground" />}
                <span className="text-sm text-muted-foreground">{shareInfo.visibility === "protected" ? "Password protected" : "Public"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="destructive" size="sm" onClick={handleDeleteShare} disabled={shareBusy}>Delete link</Button>
                <Button size="sm" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShareVisibility("public")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm ${shareVisibility === "public" ? "border-primary/40 bg-primary/5 font-medium" : "hover:bg-muted"}`}>
                  <Globe className="size-4" /> Public
                </button>
                <button type="button" onClick={() => setShareVisibility("protected")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm ${shareVisibility === "protected" ? "border-primary/40 bg-primary/5 font-medium" : "hover:bg-muted"}`}>
                  <Lock className="size-4" /> Protected
                </button>
              </div>
              {shareVisibility === "protected" && (
                <div className="space-y-2">
                  <Label htmlFor="share-password">Password</Label>
                  <Input id="share-password" type="password" placeholder="Enter a password" value={sharePassword} onChange={(e) => setSharePassword(e.target.value)} />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleShare} disabled={shareBusy || (shareVisibility === "protected" && !sharePassword)}>
                  {shareBusy ? <Loader2 className="animate-spin" /> : <Share2 className="size-4" />} Generate link
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
