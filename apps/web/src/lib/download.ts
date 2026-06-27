import { apiUrl, getActiveWorkspaceId } from "./utils";

export async function downloadReportFile({
  reportId,
  filename,
  apiPath,
  addToast,
  removeToast,
}: {
  reportId: number;
  filename: string;
  apiPath: string;
  addToast: (toast: { type: string; title: string; description?: string }) => string;
  removeToast: (id: string) => void;
}): Promise<void> {
  const loadingId = addToast({ type: "loading", title: "Downloading..." });
  try {
    const token = localStorage.getItem("auth_token");
    const wsId = getActiveWorkspaceId();
    const res = await fetch(apiUrl(apiPath), {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(wsId ? { "X-Workspace-Id": String(wsId) } : {}),
      },
    });
    if (!res.ok) {
      removeToast(loadingId);
      const body = await res.text().catch(() => "");
      addToast({ type: "error", title: "Download failed", description: body || res.statusText });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    removeToast(loadingId);
    addToast({ type: "success", title: "Downloaded", description: "File downloaded" });
  } catch (e) {
    removeToast(loadingId);
    addToast({ type: "error", title: "Download failed", description: String(e) });
  }
}
