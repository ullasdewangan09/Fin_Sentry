import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuditStore } from "@/store/useAuditStore";
import { getDataQualityReport, getGraphStats, getSystemicInsights, testTransactions } from "@/lib/api";
import { ScanLoader } from "@/components/ScanLoader";
import { getRiskColor } from "@/lib/formatting";
import {
  Network, AlertTriangle, ArrowRightLeft, Database, Brain,
  RefreshCw, X, ChevronRight, CheckCircle2, Circle, Layers, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

function AnimatedNumber({ value, duration = 500 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>();
  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value, duration]);
  return <span className="font-mono">{display}</span>;
}

const pipelineSteps = [
  "Data Loaded", "Graph Built", "Risks Detected", "Transactions Tested", "Narrative Generated",
];

const NODE_TYPE_COLORS: Record<string, string> = {
  employee: "text-cyber-emerald",
  vendor: "text-primary",
  vendor_creation: "text-cyan-400",
  invoice: "text-cyber-amber",
  approval_decision: "text-blue-400",
  transaction: "text-purple-400",
};

export default function DashboardPage() {
  const {
    investigationData, dataQualityReport, graphStats, transactionReport,
    setDataQualityReport, setGraphStats, setTransactionReport,
  } = useAuditStore();

  const [loading, setLoading] = useState(
    !dataQualityReport || !graphStats || !transactionReport
  );
  const [selectedFinding, setSelectedFinding] = useState<any>(null);
  const [systemicInsights, setSystemicInsights] = useState<any>(null);

  const fetchAll = (force = false) => {
    setLoading(true);
    Promise.all([
      (!dataQualityReport || force)
        ? getDataQualityReport().then(r => r.data).catch(() => null)
        : Promise.resolve(null),
      (!graphStats || force)
        ? getGraphStats().then(r => r.data).catch(() => null)
        : Promise.resolve(null),
      (!transactionReport || force)
        ? testTransactions().then(r => r.data).catch(() => null)
        : Promise.resolve(null),
      getSystemicInsights().then(r => r.data).catch(() => null),
    ]).then(([dq, gs, tr, insights]) => {
      if (dq) setDataQualityReport(dq);
      if (gs) setGraphStats(gs);
      if (tr) setTransactionReport(tr);
      if (insights) setSystemicInsights(insights);
      setLoading(false);
    });
  };

  useEffect(() => {
    // Only fetch if any piece of data is missing — avoids ScanLoader flash on revisit
    if (!dataQualityReport || !graphStats || !transactionReport) fetchAll();
  }, []);

  if (loading) return <ScanLoader />;

  const inv = investigationData;
  const totalRisks = inv?.total_risks ?? 0;
  const findings = inv?.findings ?? [];
  const narrative = inv?.narrative ?? null;
  const narrativeSummary = narrative
    ? (() => {
        const parts = narrative.split('. ');
        return parts.length <= 2 ? narrative : parts.slice(0, 2).join('. ') + '.';
      })()
    : null;
  const auditSession = inv?.audit_session;

  const gs = graphStats;
  const totalNodes = gs?.total_nodes ?? 0;
  const totalEdges = gs?.total_edges ?? 0;
  const nodeTypes: Record<string, number> = gs?.node_types ?? {};

  const txSummary = transactionReport?.summary;
  const txTotal = txSummary?.total_transactions ?? 0;
  const txPassed = txSummary?.fully_passed ?? 0;
  const txRate = txTotal > 0 ? Math.round((txPassed / txTotal) * 100) : 0;

  const dqClean = dataQualityReport?.overall_clean;
  const dqIssues = dataQualityReport?.total_issues_found ?? 0;

  const TOTAL_RULES = 8;
  const violatedRuleCount = inv ? new Set(findings.map((f: any) => f.risk_type)).size : 0;
  const complianceScore = inv ? Math.round(((TOTAL_RULES - violatedRuleCount) / TOTAL_RULES) * 100) : 0;
  const complianceColor = complianceScore >= 87 ? "text-cyber-emerald" : complianceScore >= 62 ? "text-cyber-amber" : "text-cyber-crimson";

  const completedSteps = [
    true,                    // Data Loaded — always true (server pre-loads on startup)
    totalNodes > 0,          // Graph Built
    !!inv,                   // Risks Detected — only after agent ran
    txTotal > 0,             // Transactions Tested
    !!inv?.narrative,        // Narrative Generated
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Audit Dashboard</h1>
        <button
          onClick={() => fetchAll(true)}
          className="text-muted-foreground hover:text-primary transition-colors"
          title="Refresh all data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Graph Scale card — real node/edge counts */}
        <div className="glass-panel p-4">
          <div className="flex items-center gap-2 mb-2">
            <Network className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Graph Scale</span>
          </div>
          <div className="text-2xl font-bold font-mono text-primary">
            <AnimatedNumber value={totalNodes} /> <span className="text-base font-normal text-muted-foreground">nodes</span>
          </div>
          <div className="text-sm font-mono text-muted-foreground mt-0.5">
            <AnimatedNumber value={totalEdges} /> edges
          </div>
          {Object.keys(nodeTypes).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(nodeTypes).map(([type, count]) => (
                <span
                  key={type}
                  className={cn("text-[10px] font-mono", NODE_TYPE_COLORS[type] ?? "text-muted-foreground")}
                  title={type.replace(/_/g, " ")}
                >
                  {count}{type === "employee" ? "e" : type === "vendor" ? "v" : type === "invoice" ? "i" : type === "transaction" ? "t" : type === "approval_decision" ? "a" : "vc"}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Risk Pathways */}
        <StatCard
          icon={AlertTriangle}
          label="Risk Pathways"
          value={inv ? <AnimatedNumber value={totalRisks} /> : "—"}
          sub={inv ? (totalRisks === 1 ? "finding" : "findings") : "Run analysis first"}
          color={inv ? (totalRisks > 0 ? "text-cyber-crimson" : "text-cyber-emerald") : "text-muted-foreground"}
        />

        {/* Transactions — real data */}
        <StatCard
          icon={ArrowRightLeft}
          label="Transactions"
          value={txTotal > 0 ? `${txPassed}/${txTotal}` : "—"}
          sub={txTotal > 0 ? `${txRate}% passing` : "Not tested yet"}
          color={txRate >= 80 ? "text-cyber-emerald" : txRate >= 50 ? "text-cyber-amber" : "text-cyber-crimson"}
        />

        {/* Data Quality */}
        <StatCard
          icon={Database}
          label="Data Quality"
          value={dqClean == null ? "—" : dqClean ? "Clean" : `${dqIssues} Issues`}
          color={dqClean == null ? "text-muted-foreground" : dqClean ? "text-cyber-emerald" : "text-cyber-amber"}
        />

        {/* Compliance Score */}
        <StatCard
          icon={Shield}
          label="Compliance"
          value={inv ? `${complianceScore}%` : "—"}
          sub={inv ? `${TOTAL_RULES - violatedRuleCount}/${TOTAL_RULES} rules passing` : "Not calculated"}
          color={inv ? complianceColor : "text-muted-foreground"}
          tooltip="Score = unique rule types not violated ÷ 8 total rules. Multiple findings of the same rule type count as 1 violation."
        />
      </div>

      {/* AI Narrative */}
      <div className="animated-border p-6 glass-panel">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="font-mono text-sm font-semibold text-primary">AI Executive Brief</h2>
        </div>
        {narrative ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground/80 leading-relaxed">{narrativeSummary}</p>
            {narrativeSummary !== narrative && (
              <Link to="/risk" className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono">
                Read full report <ChevronRight className="w-3 h-3" />
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Navigate to{" "}
            <Link to="/risk" className="text-primary hover:underline">Risk Intelligence</Link>
            {" "}→ the live audit will generate the AI executive narrative automatically.
          </p>
        )}
        {auditSession?.run_at && (
          <p className="text-xs text-muted-foreground mt-3 font-mono">
            Last audited: {new Date(auditSession.run_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Bottom Grid */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Risk Pathways list */}
        <div className="lg:col-span-3 space-y-3">
          <h3 className="font-mono text-sm text-muted-foreground">RISK PATHWAYS</h3>
          {!inv && (
            <div className="glass-panel p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Analysis not yet run.</p>
              <p className="text-xs font-mono text-muted-foreground/60">Navigate to <span className="text-primary">Risk Intelligence</span> to start the live audit pipeline.</p>
            </div>
          )}
          {inv && findings.length === 0 && (
            <p className="text-sm text-muted-foreground">No risk findings detected.</p>
          )}
          {findings.map((f: any, i: number) => (
            <button
              key={i}
              onClick={() => setSelectedFinding(f)}
              className="w-full text-left glass-panel p-4 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("risk-badge text-background", getRiskColor(f.risk_type))}>
                  {f.risk_type.replace(/_/g, " ")}
                </span>
                <span className="text-sm font-mono text-foreground">{f.vendor}</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 flex-wrap">
                {f.pathway?.map((p: string, j: number) => (
                  <span key={j} className="flex items-center gap-1">
                    {j > 0 && <ChevronRight className="w-3 h-3" />}
                    {p}
                  </span>
                ))}
              </div>
              {f.effect && <p className="text-xs text-muted-foreground italic mt-1">{f.effect}</p>}
            </button>
          ))}
        </div>

        {/* Audit pipeline timeline */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-mono text-sm text-muted-foreground">AUDIT PIPELINE</h3>

          {/* Node type breakdown */}
          {Object.keys(nodeTypes).length > 0 && (
            <div className="glass-panel p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-mono text-muted-foreground">NODE BREAKDOWN</span>
              </div>
              {Object.entries(nodeTypes).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-xs">
                  <span className={cn("font-mono capitalize", NODE_TYPE_COLORS[type] ?? "text-foreground/70")}>
                    {type.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-foreground">{count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {pipelineSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {completedSteps[i] ? (
                  <CheckCircle2 className="w-5 h-5 text-cyber-emerald flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                )}
                <span className={cn("text-sm font-mono", completedSteps[i] ? "text-foreground" : "text-muted-foreground")}>
                  Step {i + 1} → {step}
                </span>
              </div>
            ))}
          </div>
        </div>

          {systemicInsights && (
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-mono text-muted-foreground">SYSTEMIC GOVERNANCE HOTSPOTS</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs font-mono text-muted-foreground mb-2">RECURRING ACTORS</div>
                  <div className="space-y-1.5">
                      {(systemicInsights.recurring_actors ?? []).slice(0, 4).map((item: any, index: number) => (
                      <div key={item.actor} className="flex justify-between font-mono">
                        <span className="text-foreground">{item.actor}</span>
                        <span className="text-primary">{item.count}</span>
                      </div>
                      ))}
                      {!(systemicInsights.recurring_actors ?? []).length && (
                        <div className="text-xs text-muted-foreground font-mono">No actor concentration detected.</div>
                      )}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground mb-2">CONTROL HOTSPOTS</div>
                  <div className="space-y-1.5">
                      {(systemicInsights.control_hotspots ?? []).slice(0, 4).map((item: any) => (
                      <div key={item.control_id} className="flex justify-between font-mono">
                        <span className="text-foreground">{item.control_id}</span>
                        <span className="text-cyber-amber">{item.count}</span>
                      </div>
                    ))}
                      {!(systemicInsights.control_hotspots ?? []).length && (
                        <div className="text-xs text-muted-foreground font-mono">No control concentrations detected.</div>
                      )}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-muted-foreground mb-2">GOVERNANCE AREAS</div>
                  <div className="space-y-1.5">
                    {(systemicInsights.governance_hotspots ?? []).slice(0, 4).map((item: any) => (
                      <div key={item.governance_area} className="flex justify-between font-mono">
                        <span className="text-foreground">{item.governance_area}</span>
                        <span className="text-cyber-crimson">{item.count}</span>
                      </div>
                    ))}
                      {!(systemicInsights.governance_hotspots ?? []).length && (
                        <div className="text-xs text-muted-foreground font-mono">No governance hotspots detected.</div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Slide-over detail panel */}
      {selectedFinding && (
        <div className="fixed inset-y-0 right-0 w-[400px] z-50 bg-card border-l border-border shadow-2xl p-6 overflow-y-auto animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <span className={cn("risk-badge text-background", getRiskColor(selectedFinding.risk_type))}>
              {selectedFinding.risk_type.replace(/_/g, " ")}
            </span>
            <button onClick={() => setSelectedFinding(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
          <h3 className="font-mono text-lg text-foreground mb-4">{selectedFinding.vendor}</h3>

          <div className="space-y-4 text-sm">
            <div>
              <h4 className="text-muted-foreground text-xs font-mono mb-1">EVIDENCE</h4>
              <ul className="space-y-1">
                {selectedFinding.evidence?.map((e: string, i: number) => (
                  <li key={i} className="text-foreground/80 flex gap-2">
                    <span className="text-primary mt-1">•</span> {e}
                  </li>
                ))}
              </ul>
            </div>
            {selectedFinding.policy_violation && (
              <div className="p-3 rounded bg-cyber-crimson/10 border border-cyber-crimson/20">
                <h4 className="text-xs font-mono text-cyber-crimson mb-1">POLICY VIOLATION</h4>
                <p className="text-foreground/80">{selectedFinding.policy_violation}</p>
              </div>
            )}
            {selectedFinding.recommendation && (
              <div className="p-3 rounded bg-cyber-amber/10 border border-cyber-amber/20">
                <h4 className="text-xs font-mono text-cyber-amber mb-1">RECOMMENDATION</h4>
                <p className="text-foreground/80">{selectedFinding.recommendation}</p>
              </div>
            )}
            {selectedFinding.graph_path && (
              <div>
                <h4 className="text-muted-foreground text-xs font-mono mb-2">GRAPH PATH</h4>
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedFinding.graph_path.map((p: string, j: number) => (
                    <span key={j} className="flex items-center gap-1">
                      {j > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                      <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono text-foreground">{p}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, tooltip }: {
  icon: any; label: string; value: React.ReactNode; sub?: string; color: string; tooltip?: string;
}) {
  return (
    <div className="glass-panel p-4" title={tooltip}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold font-mono", color)}>{value}</div>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
