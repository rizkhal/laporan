import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { Button } from "../../components/ui/Button";
import { useNavigate } from "react-router-dom";

export function DangerSection() {
  const { user, activeWorkspace, deleteAccount, deleteWorkspace } = useAuth();
  const navigate = useNavigate();

  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    if (!deleteAccountPassword) return;
    setDeletingAccount(true);
    setAccountError(null);
    try {
      await deleteAccount(deleteAccountPassword);
      navigate("/login");
    } catch (err: any) {
      setAccountError(err.message || "Failed to delete account");
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!activeWorkspace) return;
    if (confirmName !== activeWorkspace.name) {
      setWorkspaceError("Workspace name does not match");
      return;
    }
    setDeletingWorkspace(true);
    setWorkspaceError(null);
    try {
      await deleteWorkspace(activeWorkspace.id);
    } catch (err: any) {
      setWorkspaceError(err.message || "Failed to delete workspace");
    } finally {
      setDeletingWorkspace(false);
    }
  }

  const nameMatch = confirmName === activeWorkspace?.name;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-destructive flex items-center gap-2">
          <AlertTriangle className="size-5" />
          Danger Area
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Irreversible actions that permanently delete data.
        </p>
      </div>

      {/* Delete Account */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-semibold">Delete Account</h3>
            <p className="text-sm text-muted-foreground">
              Permanently delete your account and all associated data. This includes all
              workspaces you own, collections, repositories, and reports. This action
              cannot be undone.
            </p>
          </div>
          <div className="shrink-0 rounded-lg bg-destructive/10 p-2">
            <Trash2 className="size-5 text-destructive" />
          </div>
        </div>

        {!deleteAccountOpen ? (
          <Button variant="destructive" className="mt-4" onClick={() => setDeleteAccountOpen(true)}>
            Delete Account
          </Button>
        ) : (
          <div className="mt-4 space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              Enter your password to confirm account deletion:
            </p>
            <input
              type="password"
              placeholder="Your password"
              value={deleteAccountPassword}
              onChange={(e) => setDeleteAccountPassword(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
            {accountError && <p className="text-sm text-destructive">{accountError}</p>}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={!deleteAccountPassword || deletingAccount}
              >
                {deletingAccount ? "Deleting..." : "Confirm Delete Account"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteAccountOpen(false);
                  setDeleteAccountPassword("");
                  setAccountError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Workspace */}
      {activeWorkspace && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-semibold">Delete Workspace</h3>
              <p className="text-sm text-muted-foreground">
                Permanently delete the workspace <strong>"{activeWorkspace.name}"</strong> and all
                its data, including collections, repositories, SSH keys, and reports.
                Only the workspace owner can perform this action.
              </p>
            </div>
            <div className="shrink-0 rounded-lg bg-destructive/10 p-2">
              <Trash2 className="size-5 text-destructive" />
            </div>
          </div>

          {!deleteWorkspaceOpen ? (
            <Button variant="destructive" className="mt-4" onClick={() => setDeleteWorkspaceOpen(true)}>
              Delete Workspace
            </Button>
          ) : (
            <div className="mt-4 space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                Are you absolutely sure? This will permanently delete all data in
                "<strong>{activeWorkspace.name}</strong>". Type the workspace name to confirm:
              </p>
              <input
                type="text"
                placeholder={activeWorkspace.name}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              />
              {workspaceError && <p className="text-sm text-destructive">{workspaceError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleDeleteWorkspace}
                  disabled={!nameMatch || deletingWorkspace}
                >
                  {deletingWorkspace ? "Deleting..." : "Confirm Delete Workspace"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteWorkspaceOpen(false);
                    setConfirmName("");
                    setWorkspaceError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
