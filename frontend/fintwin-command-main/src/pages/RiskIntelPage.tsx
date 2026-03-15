import { useEffect, useState, useRef } from "react";
import { useAuditStore } from "@/store/useAuditStore";
import { getRiskColor, getRiskTextColor } from "@/lib/formatting";
import { RefreshCw, ChevronRight, ChevronDown, AlertTriangle, Lightbulb, DollarSign, Zap, Activity, Brain, CheckCircle2, Circle, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { generateAuditPDF } from "@/lib/auditReportPDF";
import { API_BASE_URL } from "@/lib/api";

// Module-level flag — survives remounts, resets on full page reload.
// Prevents a second SSE from firing if the user navigates away mid-stream and returns.
let _auditStreamActive = false;

const RISK_COLORS: Record<string, string> = {
  segregation_of_duties: "#FF3B5C",
  invoice_splitting: "#FFB800",
  rapid_vendor_to_payment: "#FF6D00",
  large_payment_no_senior_approver: "#FFB800",
  missing_approval: "#FF3B5C",
  duplicate_invoice: "#FF6D00",
  amount_mismatch: "#B44FFF",
  dormant_vendor_reactivation: "#00BCD4",
};

export default function RiskIntelPage() {
  const { investigationData, setInvestigationData, setLastRunAt, complianceData, token } = useAuditStore();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [streamStage, setStreamStage] = useState<"idle" | "data_agent" | "investigation_agent" | "complete" | "error">("idle");
  const [streamLogs, setStreamLogs] = useState<Array<{ agent: string; content: string }>>([]); 
  const [streamNarrative, setStreamNarrative] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-start only if: no cached results AND no stream currently active
    if (!investigationData?.narrative && !investigationData?.findings?.length && !_auditStreamActive) {
      handleRunAuditStream();
    }
  }, []);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [streamLogs]);

  const handleRunAuditStream = () => {
    if (!token) {
      setStreamStage("error");
      setStreamLogs([{ agent: "system", content: "Authentication required. Please sign in again." }]);
      return;
    }

    _auditStreamActive = true;
    // Clear the stored narrative so the cached text doesn't compete with word-by-word typing
    if (investigationData) {
      setInvestigationData({ ...investigationData, narrative: "" });
    }
    setAuditRunning(true);
    setStreamStage("data_agent");
    setStreamLogs([]);
    setStreamNarrative("");

    const es = new EventSource(`${API_BASE_URL}/run-audit/stream?access_token=${encodeURIComponent(token)}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "routing") {
        if (data.next === "investigation_agent") setStreamStage("investigation_agent");
        if (data.next === "FINISH") setStreamStage("complete");
      } else if (data.type === "agent_step") {
        setStreamLogs(prev => [...prev, { agent: data.agent, content: data.content }]);
      } else if (data.type === "complete") {
        _auditStreamActive = false;
        setStreamStage("complete");
        setAuditRunning(false);
        const completedData = {
          findings: data.findings ?? [],
          total_risks: data.total_risks ?? 0,
          audit_session: data.audit_session ?? null,
          narrative: data.narrative ?? "",
        };
        setInvestigationData(completedData);
        if (data.audit_session?.run_at) setLastRunAt(data.audit_session.run_at);
        const words = (data.narrative ?? "").split(" ");
        let i = 0;
        const iv = setInterval(() => {
          setStreamNarrative(prev => prev + (i > 0 ? " " : "") + words[i]);
          i++;
          if (i >= words.length) clearInterval(iv);
        }, 25);
        es.close();
      } else if (data.type === "error") {
        _auditStreamActive = false;
        setStreamStage("error");
        setStreamLogs(prev => [...prev, { agent: "system", content: `ERROR: ${data.message}` }]);
        setAuditRunning(false);
        es.close();
      }
    };

    es.onerror = () => {
      _auditStreamActive = false;
      setStreamStage("error");
      setAuditRunning(false);
      es.close();
    };
  };

  const findings = investigationData?.findings ?? [];
  const totalRisks = investigationData?.total_risks ?? 0;
  const cachedNarrative = investigationData?.narrative ?? "";
  const narrativeText = streamNarrative || cachedNarrative;
  const dataAgentLogCount = streamLogs.filter(l => l.agent === "data_agent").length;
  const invAgentLogCount = streamLogs.filter(l => l.agent === "investigation_agent").length;

  const riskCounts: Record<string, number> = {};
  findings.forEach((f: any) => { riskCounts[f.risk_type] = (riskCounts[f.risk_type] ?? 0) + 1; });
  const chartData = Object.entries(riskCounts).map(([name, value]) => ({
    name: name.replace(/_/g, " "),
    value,
    fill: RISK_COLORS[name] ?? "#666",
  }));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Risk Intelligence Center</h1>
        {totalRisks > 0 && (
          <span className="px-2 py-0.5 rounded bg-cyber-crimson/20 text-cyber-crimson text-xs font-mono">
            {totalRisks} finding{totalRisks !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Live Autonomous Audit ───────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-primary" />
          <h3 className="font-mono text-sm text-muted-foreground">AUTONOMOUS AUDIT PIPELINE</h3>
          {streamStage === "complete" && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyber-emerald/20 text-cyber-emerald border border-cyber-emerald/30">COMPLETE</span>
          )}
          {streamStage === "error" && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyber-crimson/20 text-cyber-crimson border border-cyber-crimson/30">ERROR</span>
          )}
          {(streamStage === "idle" || streamStage === "complete") && findings.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => generateAuditPDF(investigationData, complianceData)}
                className="flex items-center gap-1.5 text-xs py-1 px-3 rounded border border-cyber-emerald/50 text-cyber-emerald hover:bg-cyber-emerald/10 transition-colors font-mono"
                title="Download full audit report as PDF"
              >
                <FileDown className="w-3 h-3" />
                Download PDF
              </button>
              <button
                onClick={handleRunAuditStream}
                disabled={auditRunning}
                className="cyber-button flex items-center gap-1.5 text-xs py-1 px-3 disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                Re-run Analysis
              </button>
            </div>
          )}
        </div>

        {streamStage !== "idle" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <AgentStageCard
                name="DATA AGENT"
                steps={["Load & Clean Data", "Build Digital Twin", "Detect Fraud Risks"]}
                status={
                  streamStage === "data_agent" ? "active"
                    : (streamStage === "investigation_agent" || streamStage === "complete") ? "done"
                    : "waiting"
                }
                completedCount={dataAgentLogCount}
              />
              <AgentStageCard
                name="INVESTIGATION AGENT"
                steps={["Test Transactions", "Generate AI Narrative"]}
                status={
                  streamStage === "investigation_agent" ? "active"
                    : streamStage === "complete" ? "done"
                    : "waiting"
                }
                completedCount={invAgentLogCount}
              />
            </div>

            {(streamLogs.length > 0 || auditRunning) && (
              <div className="bg-[#0a0b10] border border-border/30 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20 bg-card/40">
                  <Activity className="w-3 h-3 text-primary" />
                  <span className="text-xs font-mono text-muted-foreground">agent — live output</span>
                  {auditRunning && <span className="ml-auto text-xs font-mono text-primary animate-pulse">● LIVE</span>}
                </div>
                <div className="p-4 max-h-72 overflow-y-auto space-y-3">
                  {streamLogs.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground/60">
                      <Activity className="w-3 h-3 animate-pulse" />
                      Connecting to agent pipeline…
                    </div>
                  ) : (
                    streamLogs.map((log, i) => (
                      <div key={i} className="space-y-1">
                        <span className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded border",
                          log.agent === "data_agent"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : log.agent === "investigation_agent"
                            ? "bg-cyber-purple/20 text-cyber-purple border-cyber-purple/30"
                            : "bg-muted/50 text-muted-foreground border-border/50"
                        )}>
                          {log.agent.replace(/_/g, " ").toUpperCase()}
                        </span>
                        <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed pl-1">
                          {log.content}
                        </pre>
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Narrative — typed live OR shown from cache on subsequent visits */}
        {narrativeText && (
          <div className="animated-border glass-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono text-primary">AI EXECUTIVE NARRATIVE</span>
            </div>
            <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
              {narrativeText}
              {auditRunning && <span className="animate-pulse text-primary ml-0.5">▊</span>}
            </p>
          </div>
        )}
      </div>

      {/* ── Risk Findings ───────────────────────────────────────── */}
      {findings.length === 0 && streamStage === "idle" && (
        <div className="glass-panel p-8 text-center text-muted-foreground font-mono text-sm">
          Initiating audit pipeline…
        </div>
      )}

      {findings.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Donut chart */}
          <div className="lg:col-span-2 glass-panel p-6">
            <h3 className="font-mono text-sm text-muted-foreground mb-4">RISK BREAKDOWN</h3>
            <div className="h-52">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    strokeWidth={0}
                  >
                    {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#12131A",
                      border: "1px solid #1e2030",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-2">
              {chartData.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm" style={{ background: d.fill }} />
                    <span className="text-foreground/80 capitalize">{d.name}</span>
                  </div>
                  <span className="font-mono text-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Accordion findings */}
          <div className="lg:col-span-3 space-y-2">
            <h3 className="font-mono text-sm text-muted-foreground mb-2">FINDING DEEP DIVE</h3>
            {findings.map((f: any, i: number) => (
              <div key={i} className="glass-panel overflow-hidden">
                <button
                  onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("risk-badge text-background", getRiskColor(f.risk_type))}>
                      {f.risk_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-mono text-foreground">{f.vendor}</span>
                    <span className="text-xs text-muted-foreground font-mono hidden sm:flex items-center gap-1">
                      {f.pathway?.slice(0, 3).map((p: string, j: number) => (
                        <span key={j} className="flex items-center gap-1">
                          {j > 0 && <ChevronRight className="w-3 h-3" />}{p}
                        </span>
                      ))}
                    </span>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform flex-shrink-0", expandedIdx === i && "rotate-180")} />
                </button>

                {expandedIdx === i && (
                  <div className="p-4 pt-0 space-y-3 text-sm border-t border-border/20">
                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground mb-1">EVIDENCE</h4>
                      {f.evidence?.map((e: string, j: number) => (
                        <div key={j} className="flex gap-2 ml-2 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                          <span className="text-foreground/80">{e}</span>
                        </div>
                      ))}
                    </div>

                    {f.policy_violation && (
                      <div className="p-3 rounded bg-cyber-crimson/10 border border-cyber-crimson/20">
                        <div className="flex items-center gap-1 mb-1">
                          <AlertTriangle className="w-3 h-3 text-cyber-crimson" />
                          <span className="text-xs font-mono text-cyber-crimson">POLICY VIOLATION</span>
                        </div>
                        <p className="text-foreground/80">{f.policy_violation}</p>
                      </div>
                    )}

                    {f.effect && (
                      <div className="flex items-start gap-2">
                        <DollarSign className="w-4 h-4 text-cyber-amber mt-0.5 flex-shrink-0" />
                        <p className="text-foreground/80">{f.effect}</p>
                      </div>
                    )}

                    {f.recommendation && (
                      <div className="p-3 rounded bg-cyber-amber/10 border border-cyber-amber/20">
                        <div className="flex items-center gap-1 mb-1">
                          <Lightbulb className="w-3 h-3 text-cyber-amber" />
                          <span className="text-xs font-mono text-cyber-amber">RECOMMENDATION</span>
                        </div>
                        <p className="text-foreground/80">{f.recommendation}</p>
                      </div>
                    )}

                    {f.graph_path && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {f.graph_path.map((p: string, j: number) => (
                          <span key={j} className="flex items-center gap-1">
                            {j > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                            <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono text-foreground">{p}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentStageCard({
  name, steps, status, completedCount = 0,
}: { name: string; steps: string[]; status: "waiting" | "active" | "done"; completedCount?: number }) {
  return (
    <div className={cn(
      "glass-panel p-4 transition-all duration-500",
      status === "active" && "border-primary/60 shadow-[0_0_24px_rgba(0,200,255,0.1)]",
      status === "done" && "border-cyber-emerald/40",
    )}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-muted-foreground">{name}</span>
        {status === "active" && <Activity className="w-3 h-3 text-primary animate-pulse" />}
        {status === "done" && <CheckCircle2 className="w-3 h-3 text-cyber-emerald" />}
        {status === "waiting" && <Circle className="w-3 h-3 text-muted-foreground/30" />}
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => {
          const isDone = status === "done" || (status === "active" && i < completedCount);
          const isActive = status === "active" && i === completedCount;
          return (
            <div key={i} className="flex items-center gap-2">
              {isDone ? (
                <CheckCircle2 className="w-3 h-3 text-cyber-emerald flex-shrink-0" />
              ) : isActive ? (
                <Activity className="w-3 h-3 text-primary animate-pulse flex-shrink-0" />
              ) : (
                <Circle className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
              )}
              <span className={cn(
                "text-xs font-mono",
                isDone ? "text-foreground/80"
                  : isActive ? "text-primary/80"
                  : "text-muted-foreground/40"
              )}>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
