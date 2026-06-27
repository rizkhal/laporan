import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { apiFetch, apiUrl } from "../../lib/utils";
import { useAuth } from "../../lib/auth";
import {
  User, Save, KeyRound, Loader2, Trash2, AlertTriangle,
} from "lucide-react";

interface ProfileSectionProps {
  user: any;
  updateProfile: (data: any) => Promise<void>;
}

export function ProfileSection({ user, updateProfile }: ProfileSectionProps) {
  const [profileName, setProfileName] = useState(() => localStorage.getItem("settings:profileName") || user?.name || "");
  const [profileEmail, setProfileEmail] = useState(() => localStorage.getItem("settings:profileEmail") || user?.email || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const [deleteAcctDialogOpen, setDeleteAcctDialogOpen] = useState(false);
  const [deleteAcctPassword, setDeleteAcctPassword] = useState("");
  const [deleteAcctLoading, setDeleteAcctLoading] = useState(false);
  const [deleteAcctError, setDeleteAcctError] = useState<string | null>(null);

  async function handleSaveProfile() {
    setProfileError(null);
    setProfileSuccess(null);
    setProfileSaving(true);
    try {
      await updateProfile({ name: profileName, email: profileEmail });
      localStorage.setItem("settings:profileName", profileName);
      localStorage.setItem("settings:profileEmail", profileEmail);
      setProfileSuccess("Profile updated successfully.");
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword() {
    setPwError(null);
    setPwSuccess(null);
    if (!pwCurrent) { setPwError("Current password is required."); return; }
    if (!pwNew || pwNew.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    if (pwNew !== pwConfirm) { setPwError("New passwords do not match."); return; }
    setPwSaving(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      setPwSuccess("Password changed successfully.");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => setPwSuccess(null), 3000);
    } catch (err: any) {
      setPwError(err.message);
    } finally {
      setPwSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteAcctError(null);
    setDeleteAcctLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(apiUrl("/auth/account"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deleteAcctPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Deletion failed" }));
        throw new Error(err.error || "Deletion failed");
      }
      setDeleteAcctDialogOpen(false);
      localStorage.removeItem("auth_token");
      localStorage.removeItem("active_workspace");
      window.location.href = "/login";
    } catch (err: any) {
      setDeleteAcctError(err.message);
    } finally {
      setDeleteAcctLoading(false);
    }
  }

  return (
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

      {/* Change Password */}
      <div className="rounded-xl border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">Change Password</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">Update your account password.</p>
          </div>
        </div>

        {pwError && (
          <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{pwError}</div>
        )}
        {pwSuccess && (
          <div className="mt-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success-foreground">{pwSuccess}</div>
        )}

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pw-current">Current Password</Label>
            <Input id="pw-current" type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="Enter current password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw-new">New Password</Label>
            <Input id="pw-new" type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw-confirm">Confirm New Password</Label>
            <Input id="pw-confirm" type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="Re-enter new password" />
          </div>
          <div className="flex justify-end pt-1">
            <Button onClick={handleChangePassword} disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}>
              {pwSaving && <Loader2 className="size-4 animate-spin" />}
              <KeyRound className="size-4" />
              Change Password
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Account */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-destructive">Delete Account</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={() => setDeleteAcctDialogOpen(true)}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      </div>

      <Dialog open={deleteAcctDialogOpen} onOpenChange={setDeleteAcctDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" /> Delete Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This will permanently delete your account, all workspaces you own, and all associated data. This action cannot be undone.</p>
            <p className="text-sm font-medium">Enter your password to confirm:</p>
            <Input type="password" value={deleteAcctPassword} onChange={e => setDeleteAcctPassword(e.target.value)} placeholder="Your password" onKeyDown={e => { if (e.key === "Enter" && deleteAcctPassword && !deleteAcctLoading) handleDeleteAccount(); }} />
            {deleteAcctError && <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteAcctError}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setDeleteAcctDialogOpen(false); setDeleteAcctPassword(""); setDeleteAcctError(null); }}>Cancel</Button>
              <Button variant="destructive" size="sm" disabled={!deleteAcctPassword || deleteAcctLoading} onClick={handleDeleteAccount}>
                {deleteAcctLoading && <Loader2 className="size-3.5 animate-spin" />}
                Permanently Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
