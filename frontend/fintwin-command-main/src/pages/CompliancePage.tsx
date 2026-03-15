import { useEffect, useState } from "react";
import { useAuditStore } from "@/store/useAuditStore";
import { getCompliance, getSystemicInsights } from "@/lib/api";
import { ScanLoader } from "@/components/ScanLoader";
import { Link } from "react-router-dom";
import {
  RefreshCw, CheckCircle2, XCircle, Shield, AlertTriangle,
  TrendingUp, BarChart2, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const RISK_LABEL_COLORS: Record<string, string> = {
  CRITICAL: "bg-cyber-crimson/20 text-cyber-crimson border-cyber-crimson/40",
  HIGH:     "bg-cyber-amber/20 text-cyber-amber border-cyber-amber/40",
  MEDIUM:   "bg-orange-500/20 text-orange-400 border-orange-500/40",
  LOW:      "bg-primary/20 text-primary border-primary/40",
};

function ComplianceScoreDisplay({ score }: { score: number }) {
  const color = score >= 80 ? "#00E676" : score >= 60 ? "#FFB800" : "#FF3B5C";
  const label = score >= 80 ? "COMPLIANT" : score >= 60 ? "AT RISK" : "NON-COMPLIANT";

  return (
    <div className="flex-1 flex flex-col justify-center items-start">
      <div className="text-[2.35rem] leading-none font-sans font-extrabold tabular-nums tracking-tight" style={{ color }}>
        {score}%
      </div>
      <span className="mt-2 text-xs font-mono font-bold tracking-widest" style={{ color }}>{label}</span>
    </div>
  );
}

export default function CompliancePage() {
  const { complianceData, setComplianceData } = useAuditStore();
  const [loading, setLoading] = useState(!complianceData);
  const [error, setError] = useState(false);
  const [systemicInsights, setSystemicInsights] = useState<any>(null);

  const fetch = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      getCompliance(),
      getSystemicInsights().catch(() => null),
    ])
      .then(([complianceResponse, insightsResponse]) => {
        setComplianceData(complianceResponse.data);
        if (insightsResponse) setSystemicInsights(insightsResponse.data);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { if (!complianceData) fetch(); else setLoading(false); }, []);

  if (loading) return <ScanLoader text="LOADING COMPLIANCE REPORT…" />;

  if (error || !complianceData) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground">Compliance Report</h1>
        <div className="glass-panel p-8 text-center space-y-3">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm font-mono">
            No compliance data available.{" "}
            <Link to="/risk" className="text-primary hover:underline">Run the AI agent pipeline</Link>
            {" "}on Risk Intelligence to generate findings first.
          </p>
        </div>
      </div>
    );
  }

  const {
    compliance_score,
    controls_passed,
    controls_total,
    total_transactions,
    flagged_transactions,
    total_findings,
    categories,
    risk_distribution,
    control_catalog,
    audit_session,
  } = complianceData;

  const passRate = Math.round((controls_passed / controls_total) * 100);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Compliance Report</h1>
          <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 rounded border border-border">
            AUDIT CYCLE
          </span>
        </div>
        <div className="flex items-center gap-3">
          {audit_session?.run_at && (
            <span className="text-xs font-mono text-muted-foreground">
              Last run:{" "}
              {new Date(audit_session.run_at).toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={fetch}
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Compliance score card — spans 1 col with ring */}
        <div className="glass-panel p-3.5 flex flex-col relative sm:col-span-1 min-h-[165px]">
          <div className="text-xs font-mono text-muted-foreground self-start">TRANSACTION COMPLIANCE</div>
          <ComplianceScoreDisplay score={compliance_score} />
        </div>

        {/* Controls passed */}
        <div className="glass-panel p-3.5 flex flex-col min-h-[165px]">
          <div className="text-xs text-muted-foreground font-mono">CONTROLS PASSED</div>
          <div className="flex-1 flex flex-col justify-center">
            <div className="text-3xl font-mono font-bold text-cyber-emerald tabular-nums tracking-tight">
              {controls_passed}
              <span className="text-lg text-muted-foreground ml-1.5">/ {controls_total}</span>
            </div>
            <div className="text-xs text-muted-foreground font-mono tabular-nums">{passRate}% controls passing</div>
            <div className="mt-2 h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyber-emerald rounded-full transition-all duration-700"
                style={{ width: `${passRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Flagged transactions */}
        <div className="glass-panel p-3.5 flex flex-col min-h-[165px]">
          <div className="text-xs text-muted-foreground font-mono">FLAGGED TRANSACTIONS</div>
          <div className="flex-1 flex flex-col justify-center">
            <div className="text-3xl font-mono font-bold text-cyber-crimson tabular-nums tracking-tight">
              {flagged_transactions}
              <span className="text-lg text-muted-foreground ml-1.5">/ {total_transactions}</span>
            </div>
            <div className="text-xs text-muted-foreground font-mono tabular-nums">transactions flagged</div>
          </div>
        </div>

        {/* Total findings */}
        <div className="glass-panel p-3.5 flex flex-col min-h-[165px]">
          <div className="text-xs text-muted-foreground font-mono">RISK FINDINGS</div>
          <div className="flex-1 flex flex-col justify-center">
            <div className="text-3xl font-mono font-bold text-cyber-amber tabular-nums tracking-tight">{total_findings}</div>
            <div className="text-xs text-muted-foreground font-mono">active findings</div>
          </div>
        </div>
      </div>

      {/* Risk distribution */}
      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-mono text-muted-foreground">FINDING SEVERITY DISTRIBUTION</h2>
        </div>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(risk_distribution as Record<string, number>).map(([label, count]) => (
            <div
              key={label}
              className={cn("px-5 py-4 rounded border text-center min-w-[90px]", RISK_LABEL_COLORS[label])}
            >
              <div className="text-3xl font-mono font-bold tabular-nums tracking-tight">{count as number}</div>
              <div className="text-xs font-mono mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Control category breakdown */}
      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-mono text-muted-foreground">INTERNAL CONTROL ASSESSMENT</h2>
        </div>
        <div className="space-y-2">
          {categories.map((cat: any) => {
            const pass = cat.status === "PASS";
            return (
              <div
                key={cat.name}
                className={cn(
                  "flex items-center gap-4 p-3.5 rounded-lg border",
                  pass
                    ? "bg-cyber-emerald/5 border-cyber-emerald/20"
                    : "bg-cyber-crimson/5 border-cyber-crimson/20"
                )}
              >
                {pass
                  ? <CheckCircle2 className="w-4 h-4 text-cyber-emerald flex-shrink-0" />
                  : <XCircle     className="w-4 h-4 text-cyber-crimson flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-foreground">{cat.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{cat.control}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      "text-xs font-mono px-2 py-0.5 rounded font-bold",
                      pass ? "text-cyber-emerald" : "text-cyber-crimson"
                    )}
                  >
                    {pass ? "PASS" : "FAIL"}
                  </span>
                  {!pass && (
                    <span className="text-xs font-mono text-cyber-crimson">
                      {cat.violations} violation{cat.violations !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {systemicInsights && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-mono text-muted-foreground">GOVERNANCE HOTSPOTS</h2>
            </div>
            <div className="space-y-2">
              {(systemicInsights.governance_hotspots ?? []).slice(0, 6).map((item: any) => (
                <div key={item.governance_area} className="flex items-center justify-between rounded-lg border border-border/70 p-3 bg-background/30">
                  <span className="text-sm text-foreground">{item.governance_area}</span>
                  <span className="text-xs font-mono text-cyber-crimson">{item.count} cases</span>
                </div>
              ))}
              {!(systemicInsights.governance_hotspots ?? []).length && (
                <div className="text-xs font-mono text-muted-foreground">No recurring governance hotspots detected.</div>
              )}
            </div>
          </div>

          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-mono text-muted-foreground">CONTROL CONCENTRATIONS</h2>
            </div>
            <div className="space-y-2">
              {(systemicInsights.control_hotspots ?? []).slice(0, 6).map((item: any) => (
                <div key={item.control_id} className="flex items-center justify-between rounded-lg border border-border/70 p-3 bg-background/30">
                  <span className="text-sm text-foreground">{item.control_id}</span>
                  <span className="text-xs font-mono text-cyber-amber">{item.count} findings</span>
                </div>
              ))}
              {!(systemicInsights.control_hotspots ?? []).length && (
                <div className="text-xs font-mono text-muted-foreground">No control concentrations detected.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {!!control_catalog?.length && (
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-mono text-muted-foreground">CONTROL COVERAGE MAP</h2>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {control_catalog.map((control: any) => (
              <div key={control.control_id} className="rounded-lg border border-border/70 p-3 bg-background/30 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-mono text-primary">{control.control_id}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{control.governance_area}</span>
                </div>
                <div className="text-sm text-foreground">{control.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{control.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info footer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          Compliance is computed from the most recent audit pipeline run.{" "}
          <Link to="/risk" className="text-primary hover:underline">Re-run Risk Intelligence</Link>
          {" "}to refresh findings and scores after policy changes.
          View individual cases in the{" "}
          <Link to="/cases" className="text-primary hover:underline">Cases</Link> page.
        </p>
      </div>
    </div>
  );
}
