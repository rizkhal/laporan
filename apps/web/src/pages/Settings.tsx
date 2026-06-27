import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/auth";
import { User, Building2, FileText } from "lucide-react";
import { ProfileSection } from "./settings/ProfileSection";
import { WorkspaceSection } from "./settings/WorkspaceSection";
import { SshKeySection } from "./settings/SshKeySection";
import { LlmSection } from "./settings/LlmSection";
import { ReportTemplateSection } from "./settings/ReportTemplateSection";
import { DbSection } from "./settings/DbSection";

type SettingsTab = "profile" | "general" | "ssh-key" | "llm" | "report-template" | "data";

interface NavItem {
  id: string;
  label: string;
  icon?: any;
  children?: { id: string; label: string }[];
}

const settingsNav: NavItem[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "workspace", label: "Workspace", icon: Building2, children: [
    { id: "general", label: "General" },
    { id: "ssh-key", label: "SSH Key" },
    { id: "llm", label: "LLM Providers" },
    { id: "report-template", label: "Report Template" },
  ]},
  { id: "data", label: "Data", icon: FileText },
];

export default function SettingsPage() {
  const { user, updateProfile, activeWorkspace, refreshWorkspaces } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabs: SettingsTab[] = ["profile", "general", "ssh-key", "llm", "report-template", "data"];
  const activeTab = (validTabs.includes(searchParams.get("tab") as SettingsTab) ? searchParams.get("tab")! : "profile") as SettingsTab;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(false);
  }, [user, activeWorkspace]);

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
        <p className="text-muted-foreground">Manage your account and workspace</p>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-destructive text-sm">{error}</div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Sidebar */}
        <nav className="flex shrink-0 flex-col gap-1 lg:w-56">
          {settingsNav.map((item) => {
            if (item.children) {
              const hasActiveChild = item.children.some(c => c.id === activeTab);
              return (
                <div key={item.id}>
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wider",
                    hasActiveChild ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {item.icon && <item.icon className="size-4" />}
                    {item.label}
                  </div>
                  {item.children.map(child => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSearchParams({ tab: child.id })}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left pl-10",
                        activeTab === child.id
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSearchParams({ tab: item.id })}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
                  activeTab === item.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {item.icon && <item.icon className="size-4 shrink-0" />}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {activeTab === "profile" && (
            <ProfileSection user={user} updateProfile={updateProfile} />
          )}
          {activeTab === "general" && (
            <WorkspaceSection activeWorkspace={activeWorkspace} refreshWorkspaces={refreshWorkspaces} />
          )}
          {activeTab === "ssh-key" && (
            <SshKeySection activeWorkspace={activeWorkspace} />
          )}
          {activeTab === "llm" && (
            <LlmSection activeWorkspace={activeWorkspace} />
          )}
          {activeTab === "report-template" && (
            <ReportTemplateSection />
          )}
          {activeTab === "data" && (
            <DbSection />
          )}
        </div>
      </div>
    </div>
  );
}
