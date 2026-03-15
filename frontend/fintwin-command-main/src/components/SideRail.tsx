import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Network, ShieldAlert, ArrowRightLeft, FileText, Hexagon, FolderOpen, ClipboardCheck, LogOut, User, Sun, Moon, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuditStore } from "@/store/useAuditStore";
import { pingBackend } from "@/lib/api";
import { useTheme } from "next-themes";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",   path: "/dashboard" },
  { icon: Network,         label: "Graph",        path: "/graph" },
  { icon: ShieldAlert,     label: "Risk Intel",   path: "/risk" },
  { icon: FolderOpen,      label: "Cases",        path: "/cases" },
  { icon: ShieldCheck,     label: "Trust Ledger", path: "/trust-ledger" },
  { icon: ClipboardCheck,  label: "Compliance",   path: "/compliance" },
  { icon: ArrowRightLeft,  label: "Transactions", path: "/transactions" },
  { icon: FileText,        label: "Policy",       path: "/policy" },
];

export function SideRail() {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const backendOnline = useAuditStore((s) => s.backendOnline);
  const setBackendOnline = useAuditStore((s) => s.setBackendOnline);
  const userName = useAuditStore((s) => s.userName);
  const userRole = useAuditStore((s) => s.userRole);
  const logout = useAuditStore((s) => s.logout);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const check = () => {
      pingBackend().then(() => setBackendOnline(true)).catch(() => setBackendOnline(false));
    };
    check();
    const i = setInterval(check, 15000);
    return () => clearInterval(i);
  }, [setBackendOnline]);

  return (
    <div
      className="fixed left-0 top-0 h-screen z-40 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300"
      style={{ width: expanded ? 200 : 64 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <Hexagon className="w-6 h-6 text-primary flex-shrink-0 drop-shadow-[0_0_6px_hsl(191_100%_50%/0.6)]" />
        {expanded && <span className="font-mono text-sm font-bold text-primary truncate">FinSentry</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1 py-3 px-2">
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {expanded && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}

      {/* Theme Toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full mt-1"
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark"
          ? <Sun className="w-5 h-5 flex-shrink-0" />
          : <Moon className="w-5 h-5 flex-shrink-0" />}
        {expanded && <span className="truncate">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
      </button>
      </nav>

      {userName && (
        <div className="px-3 py-2 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            {expanded && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{userName}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{userRole}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => { logout(); navigate("/"); }}
            className="mt-1 flex items-center gap-2 w-full px-1 py-1 rounded text-xs text-muted-foreground hover:text-cyber-crimson hover:bg-cyber-crimson/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            {expanded && <span>Log out</span>}
          </button>
        </div>
      )}

      {/* Status */}
      <div className="px-4 py-3 border-t border-sidebar-border flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full flex-shrink-0", backendOnline ? "bg-cyber-emerald animate-pulse" : "bg-cyber-crimson")} />
        {expanded && (
          <span className="text-xs text-muted-foreground truncate">
            {backendOnline ? "System Live" : "Offline"}
          </span>
        )}
      </div>
    </div>
  );
}
