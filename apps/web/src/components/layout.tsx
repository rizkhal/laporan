import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/auth";
import {
  ArrowRight, BarChart3, Command, FileText, FolderGit2, LogOut, Moon,
  Search, Settings, Sun, Tags, User, X,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/collections", label: "Collections", icon: FolderGit2 },
  { href: "/repositories", label: "Repositories", icon: FolderGit2 },
  { href: "/categories", label: "Categories", icon: Tags },
];

const commands = [
  { label: "Open overview", href: "/dashboard", detail: "Dashboard" },
  { label: "Start a collection", href: "/collections", detail: "Collection" },
  { label: "Manage repositories", href: "/repositories", detail: "Configuration" },
  { label: "Manage categories", href: "/categories", detail: "Configuration" },
  { label: "Open settings", href: "/settings", detail: "System" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
      : false
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101218" : "#f8f9fb");
  }, [dark]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredCommands = useMemo(
    () => commands.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl dark:border-white/[0.055] dark:bg-background/78">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-5 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-white shadow-sm shadow-primary/20">
              <FileText className="size-4" strokeWidth={1.8} />
            </span>
            <span className="hidden text-sm font-semibold tracking-[-0.02em] sm:block">Monthly Report</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const active = item.href === "/dashboard" ? location.pathname === "/dashboard" : location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-muted text-foreground dark:bg-white/[0.075]" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:hover:bg-white/[0.05]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 min-w-52 items-center gap-2 rounded-lg border border-border/80 bg-muted/35 px-3 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted dark:border-white/[0.07] dark:bg-white/[0.035] dark:shadow-none dark:hover:bg-white/[0.065] sm:flex"
            >
              <Search className="size-3.5" />
              <span>Search or jump to</span>
              <kbd className="ml-auto rounded border bg-card px-1.5 py-0.5 font-mono text-[10px] dark:border-white/[0.08] dark:bg-white/[0.045]">⌘K</kbd>
            </button>
            <button type="button" aria-label="Open command palette" onClick={() => setPaletteOpen(true)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden">
              <Command className="size-4" />
            </button>
            <button type="button" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark((value) => !value)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Link to="/settings" aria-label="Settings" className={cn("hidden sm:grid size-9 place-items-center rounded-lg", location.pathname === "/settings" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <Settings className="size-4" />
            </Link>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="grid size-8 place-items-center rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {user?.name?.charAt(0).toUpperCase() || <User className="size-4" />}
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl shadow-popover/15">
                    <div className="border-b px-4 py-3">
                      <p className="truncate text-sm font-medium">{user?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                    <Link to="/settings" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <Settings className="size-4" /> Settings
                    </Link>
                    <button type="button" onClick={() => { setUserMenuOpen(false); logout(); navigate("/"); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <LogOut className="size-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
          {navItems.slice(0, 3).map((item) => (
            <Link key={item.href} to={item.href} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium", (item.href === "/dashboard" ? location.pathname === "/dashboard" : location.pathname.startsWith(item.href)) ? "bg-muted text-foreground" : "text-muted-foreground")}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setPaletteOpen(false)}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl shadow-popover/15" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="size-4 text-muted-foreground" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and actions" className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              <button type="button" onClick={() => setPaletteOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="p-2">
              <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">Navigate</p>
              {filteredCommands.map((item) => (
                <button key={item.href} type="button" onClick={() => { navigate(item.href); setPaletteOpen(false); setQuery(""); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted">
                  <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground"><ArrowRight className="size-3.5" /></span>
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{item.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
