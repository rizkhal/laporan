import { useState, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/utils";
import { Download, Loader2, Upload } from "lucide-react";

export function DbSection() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

  async function handleExport() {
    setExporting(true);
    setImportResult(null);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_BASE}/api/settings/db/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-db-${Date.now()}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setImportResult({ success: false, message: err.message });
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const token = localStorage.getItem("auth_token");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/settings/db/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Import failed");
      setImportResult({ success: true, message: body.message || "Database imported successfully" });
    } catch (err: any) {
      setImportResult({ success: false, message: err.message });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Data</h2>
        <p className="text-sm text-muted-foreground">Export or import the full database.</p>
      </div>

      {importResult && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm",
          importResult.success
            ? "border-success/20 bg-success/10 text-success-foreground"
            : "border-destructive/20 bg-destructive/10 text-destructive"
        )}>
          {importResult.message}
        </div>
      )}

      {/* Export */}
      <div className="surface rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">Export Database</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              Download a complete backup of the current database, including all users, workspaces, repositories, and reports.
            </p>
          </div>
          <Button onClick={handleExport} disabled={exporting} size="sm">
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            {exporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </div>

      {/* Import */}
      <div className="surface rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold">Import Database</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              Restore from a previous database backup. The imported database must contain valid tables. This will replace all current data.
            </p>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".db,.sqlite,.sqlite3"
              onChange={handleImport}
              className="hidden"
            />
            <Button onClick={() => fileRef.current?.click()} disabled={importing} size="sm" variant="outline">
              {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              {importing ? "Importing..." : "Import .db"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
