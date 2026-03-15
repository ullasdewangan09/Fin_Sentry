import { useAuditStore } from "@/store/useAuditStore";
import { RefreshCw } from "lucide-react";
import { pingBackend } from "@/lib/api";

export function SystemHealthBar() {
  const backendOnline = useAuditStore((s) => s.backendOnline);
  const lastRunAt = useAuditStore((s) => s.lastRunAt);
  const setBackendOnline = useAuditStore((s) => s.setBackendOnline);

  const refresh = () => {
    pingBackend().then(() => setBackendOnline(true)).catch(() => setBackendOnline(false));
  };

  return (
    <div className="fixed top-0 left-16 right-0 h-8 z-30 bg-cyber-surface/80 backdrop-blur border-b border-border/30 flex items-center justify-between px-4 text-xs">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${backendOnline ? 'bg-cyber-emerald' : 'bg-cyber-crimson'}`} />
        <span className="text-muted-foreground font-mono">
          {backendOnline ? "Backend Connected" : "Offline"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {lastRunAt && (
          <span className="text-muted-foreground font-mono">
            Last pipeline: {new Date(lastRunAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button onClick={refresh} className="text-muted-foreground hover:text-primary transition-colors">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
