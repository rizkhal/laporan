import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { CheckCircle, XCircle, Loader2, X } from "lucide-react";

export type ToastType = "success" | "error" | "loading" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  link?: string;
  onDismiss?: () => void;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);

    // Auto-dismiss success/info after 4s
    if (toast.type === "success" || toast.type === "info") {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-card p-4 shadow-lg shadow-black/10 dark:shadow-black/30 animate-in slide-in-from-right-5 fade-in duration-200",
                toast.type === "success" && "border-emerald-500/30 dark:border-emerald-500/20",
                toast.type === "error" && "border-red-500/30 dark:border-red-500/20",
                toast.type === "loading" && "border-blue-500/30 dark:border-blue-500/20",
                toast.type === "info" && "border-border",
              )}
            >
              <span className="mt-0.5 shrink-0">
                {toast.type === "success" && <CheckCircle className="size-4 text-emerald-500" />}
                {toast.type === "error" && <XCircle className="size-4 text-red-500" />}
                {toast.type === "loading" && <Loader2 className="size-4 animate-spin text-blue-500" />}
                {toast.type === "info" && <Loader2 className="size-4 text-muted-foreground" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{toast.title}</p>
                {toast.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// Re-export for convenience
export const toast = {
  success: (title: string, description?: string) => {},
  error: (title: string, description?: string) => {},
  loading: (title: string, description?: string) => {},
};
