import { useEffect, useRef, useState } from "react";
import { useAuditStore } from "@/store/useAuditStore";
import {
  getCases,
  updateCaseStatus,
  updateCaseGovernance,
  explainCase,
  chatCase,
  anchorCaseOnWeb3,
  getCaseWeb3Proofs,
  issueCaseBadge,
  getCaseBadges,
} from "@/lib/api";
import { generateCasePDF, generateAuditorReport } from "@/lib/auditReportPDF";
import { ScanLoader } from "@/components/ScanLoader";
import { getRiskTextColor } from "@/lib/formatting";
import {
  RefreshCw, ChevronDown, ChevronRight, Download, Lightbulb, X,
  AlertTriangle, Shield, Clock, CheckCircle2, AlertCircle, HelpCircle,
  FileText, Users, Scale, GitBranch, Info, Bot, Send, Network, Link2, Copy, BadgeCheck,
  Search, FileEdit, ArrowUpDown,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const LABEL_COLORS: Record<string, string> = {
  CRITICAL: "bg-cyber-crimson/20 text-cyber-crimson border border-cyber-crimson/40",
  HIGH:     "bg-cyber-amber/20 text-cyber-amber border border-cyber-amber/40",
  MEDIUM:   "bg-orange-500/20 text-orange-400 border border-orange-500/40",
  LOW:      "bg-primary/20 text-primary border border-primary/40",
};

const STATUS_COLORS: Record<string, string> = {
  open:           "bg-cyber-crimson/20 text-cyber-crimson",
  under_review:   "bg-cyber-amber/20 text-cyber-amber",
  escalated:      "bg-orange-500/20 text-orange-400",
  closed:         "bg-cyber-emerald/20 text-cyber-emerald",
  false_positive: "bg-muted text-muted-foreground",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  open:           AlertCircle,
  under_review:   Clock,
  escalated:      AlertTriangle,
  closed:         CheckCircle2,
  false_positive: HelpCircle,
};

const PROOF_STATUS_COLORS: Record<string, string> = {
  submitted: "bg-cyber-emerald/20 text-cyber-emerald border border-cyber-emerald/40",
  simulated: "bg-cyan-500/10 text-cyan-400 border border-cyan-400/30",
  queued: "bg-cyber-amber/20 text-cyber-amber border border-cyber-amber/40",
  pending: "bg-muted text-muted-foreground border border-border/40",
};

const PROOF_MODE_COLORS: Record<string, string> = {
  onchain: "bg-cyber-emerald/20 text-cyber-emerald border border-cyber-emerald/40",
  simulated: "bg-cyan-500/10 text-cyan-400 border border-cyan-400/30",
  queued: "bg-cyber-amber/20 text-cyber-amber border border-cyber-amber/40",
};

const shortHash = (value?: string) => {
  if (!value) return "N/A";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
};

const getProofMode = (status?: string) => {
  if (status === "submitted") return { key: "onchain", label: "On-chain Submitted" };
  if (status === "simulated") return { key: "simulated", label: "Simulated" };
  return { key: "queued", label: "Queued/Relay Pending" };
};

const getBadgeMode = (status?: string) => {
  if (status === "submitted") return { key: "onchain", label: "NFT Minted On-chain" };
  if (status === "simulated") return { key: "simulated", label: "Simulated Badge Mint" };
  return { key: "queued", label: "Queued/Relay Pending" };
};

const VALID_STATUSES = ["open", "under_review", "escalated", "closed", "false_positive"];

function RiskScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "#FF3B5C" : score >= 0.65 ? "#FFB800" : "#00D4FF";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="font-mono text-xs" style={{ color }}>{pct}</span>
    </div>
  );
}

function ExplainPanel({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    explainCase(caseId)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [caseId]);

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] z-50 bg-card border-l border-border shadow-2xl overflow-y-auto animate-slide-up">
      <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-cyber-amber" />
          <span className="font-mono text-sm font-bold text-cyber-amber">EXPLAINABILITY REPORT</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      {loading && <div className="p-5"><ScanLoader text="GENERATING EXPLANATION…" /></div>}
      {!loading && !data && <div className="p-5 text-muted-foreground text-sm">Failed to load explanation.</div>}
      {data && (
        <div className="p-5 space-y-5 text-sm">
          {/* Header */}
          <div>
            <div className="text-xs font-mono text-muted-foreground mb-1">{data.case_id}</div>
            <div className="text-base font-bold text-foreground">{data.vendor}</div>
            <div className={cn("inline-block mt-1 text-xs px-2 py-0.5 rounded font-mono", LABEL_COLORS[data.risk_label] ?? "")}>{data.risk_label}</div>
            {data.governance_area && (
              <div className="mt-2 text-xs font-mono text-primary">{data.governance_area}</div>
            )}
          </div>

          {/* Why Flagged */}
          <Section title="WHY FLAGGED" icon={AlertTriangle} color="text-cyber-crimson">
            <p className="text-foreground/80 leading-relaxed">{data.why_flagged?.rule_description}</p>
            {data.control_bypass_narrative && (
              <div className="mt-2 p-3 rounded bg-primary/10 border border-primary/20 text-foreground/80">
                {data.control_bypass_narrative}
              </div>
            )}
            {data.why_flagged?.summary && (
              <div className="mt-2 p-3 rounded bg-cyber-crimson/10 border border-cyber-crimson/20 text-foreground/80">
                {data.why_flagged.summary}
              </div>
            )}
          </Section>

          {/* Actors */}
          {data.why_flagged?.actors_involved?.length > 0 && (
            <Section title="ACTORS INVOLVED" icon={Users} color="text-primary">
              <div className="flex flex-wrap gap-2">
                {data.why_flagged.actors_involved.map((a: string) => (
                  <span key={a} className="px-2 py-1 rounded bg-primary/10 border border-primary/20 font-mono text-xs text-primary">{a}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Evidence */}
          <Section title="EVIDENCE" icon={FileText} color="text-muted-foreground">
            <ul className="space-y-1">
              {data.why_flagged?.evidence?.map((e: string, i: number) => (
                <li key={i} className="flex gap-2 text-foreground/80">
                  <span className="text-primary mt-1 flex-shrink-0">•</span>{e}
                </li>
              ))}
            </ul>
          </Section>

          {/* Counterfactual */}
          <Section title="COUNTERFACTUAL ANALYSIS" icon={Scale} color="text-cyber-amber">
            <p className="text-xs text-muted-foreground mb-2 italic">{data.counterfactual_analysis?.question}</p>
            <ul className="space-y-1.5">
              {data.counterfactual_analysis?.scenarios?.map((s: string, i: number) => (
                <li key={i} className="flex gap-2 text-foreground/80">
                  <span className="text-cyber-amber mt-1 flex-shrink-0">→</span>{s}
                </li>
              ))}
            </ul>
          </Section>

          {/* Traceability */}
          {data.traceability?.length > 0 && (
            <Section title="GRAPH TRACEABILITY" icon={GitBranch} color="text-cyan-400">
              <div className="space-y-2">
                {data.traceability.map((t: any, i: number) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="font-mono text-xs text-muted-foreground w-6 flex-shrink-0">#{t.step}</span>
                    <div>
                      <div className="font-mono text-xs text-cyan-400">{t.node}</div>
                      <div className="text-xs text-muted-foreground capitalize">{t.type.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Policy Context */}
          <Section title="POLICY THRESHOLDS" icon={Shield} color="text-muted-foreground">
            {data.control_ids?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {data.control_ids.map((controlId: string) => (
                  <span key={controlId} className="px-2 py-1 rounded bg-cyber-amber/10 border border-cyber-amber/20 font-mono text-[11px] text-cyber-amber">
                    {controlId}
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {Object.entries(data.policy_context ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                  <span className="font-mono text-foreground">{Array.isArray(v) ? (v as string[]).join(", ") : String(v)}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, color, children }: { title: string; icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={cn("flex items-center gap-2 mb-2", color)}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs font-mono">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  "Why was this case flagged?",
  "Who are the actors involved?",
  "What should the auditor do next?",
  "Explain the detection pathway",
];

function ChatPanel({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: q }]);
    setSending(true);
    try {
      const resp = await chatCase(caseId, q);
      setMessages(prev => [...prev, { role: "ai", content: resp.data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: "ai", content: "Failed to get a response. Please check that the backend is running and try again." }]);
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] z-50 bg-card border-l border-border shadow-2xl flex flex-col animate-slide-up">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <span className="font-mono text-sm font-bold text-primary">AI INVESTIGATION ASSISTANT</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Context banner */}
      <div className="px-4 py-2 bg-primary/5 border-b border-border/40 flex-shrink-0">
        <span className="text-xs font-mono text-muted-foreground">Investigating: </span>
        <span className="text-xs font-mono text-primary">{caseId}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-xs font-mono text-muted-foreground text-center pt-6 pb-2">
              Ask anything about this case — actors, risks, recommendations, or the decision pathway.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs font-mono px-3 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "text-sm rounded-lg p-3 leading-relaxed",
              m.role === "user"
                ? "bg-primary/10 text-foreground ml-10 border border-primary/20"
                : "bg-muted/30 text-foreground mr-10 border border-border/40"
            )}
          >
            {m.role === "ai" && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-primary mb-1.5">
                <Bot className="w-3 h-3" /> AI ASSISTANT
              </div>
            )}
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="mr-10">
            <div className="bg-muted/30 rounded-lg p-3 border border-border/40 text-xs font-mono text-muted-foreground animate-pulse">
              Analyzing case data…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4 flex gap-2 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about this case…"
          className="flex-1 text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
        />
        <button
          onClick={() => send(input)}
          disabled={sending || !input.trim()}
          className="px-3 py-2 rounded bg-primary text-background disabled:opacity-40 hover:bg-primary/80 transition-colors flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function CasesPage() {
  const { casesData, setCasesData, setHighlightedPath, setHighlightedCaseId, userRole } = useAuditStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!casesData);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [explainId, setExplainId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [savingGovernanceId, setSavingGovernanceId] = useState<string | null>(null);
  const [governanceDrafts, setGovernanceDrafts] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"risk_score" | "case_id" | "risk_label">("risk_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [reportCaseId, setReportCaseId] = useState<string | null>(null);
  const [proofsByCase, setProofsByCase] = useState<Record<string, any[]>>({});
  const [proofLoadingByCase, setProofLoadingByCase] = useState<Record<string, boolean>>({});
  const [badgesByCase, setBadgesByCase] = useState<Record<string, any[]>>({});
  const [badgeLoadingByCase, setBadgeLoadingByCase] = useState<Record<string, boolean>>({});
  const [anchoringId, setAnchoringId] = useState<string | null>(null);
  const [issuingBadgeId, setIssuingBadgeId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const canOperateCases = userRole === "admin" || userRole === "risk_analyst";

  const handleViewInGraph = (c: any) => {
    setHighlightedPath(c.graph_path ?? []);
    setHighlightedCaseId(c.case_id);
    navigate("/graph");
  };

  const applyStatusFilter = (v: string) => { setStatusFilter(v); setExpandedId(null); };
  const applyLabelFilter  = (v: string) => { setLabelFilter(v);  setExpandedId(null); };

  const fetch = () => {
    setLoading(true);
    getCases()
      .then(r => { setCasesData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchProofs = async (caseId: string) => {
    setProofLoadingByCase((prev) => ({ ...prev, [caseId]: true }));
    try {
      const resp = await getCaseWeb3Proofs(caseId);
      setProofsByCase((prev) => ({ ...prev, [caseId]: resp.data?.proofs ?? [] }));
    } catch (_) { /* ignore */ }
    setProofLoadingByCase((prev) => ({ ...prev, [caseId]: false }));
  };

  const fetchBadges = async (caseId: string) => {
    setBadgeLoadingByCase((prev) => ({ ...prev, [caseId]: true }));
    try {
      const resp = await getCaseBadges(caseId);
      setBadgesByCase((prev) => ({ ...prev, [caseId]: resp.data?.badges ?? [] }));
    } catch (_) { /* ignore */ }
    setBadgeLoadingByCase((prev) => ({ ...prev, [caseId]: false }));
  };

  const toggleExpanded = (caseId: string) => {
    if (expandedId === caseId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(caseId);
    void fetchProofs(caseId);
    void fetchBadges(caseId);
  };

  useEffect(() => { if (!casesData) fetch(); else setLoading(false); }, []);

  const handleStatusChange = async (caseId: string, newStatus: string) => {
    if (!canOperateCases) return;
    setUpdatingId(caseId);
    try {
      await updateCaseStatus(caseId, newStatus);
      await getCases().then(r => setCasesData(r.data));
    } catch (_) { /* ignore */ }
    setUpdatingId(null);
  };

  const updateGovernanceDraft = (caseId: string, field: string, value: string) => {
    setGovernanceDrafts((prev) => ({
      ...prev,
      [caseId]: {
        owner: prev[caseId]?.owner ?? "",
        remediation_action: prev[caseId]?.remediation_action ?? "",
        remediation_due_at: prev[caseId]?.remediation_due_at ?? "",
        resolution_notes: prev[caseId]?.resolution_notes ?? "",
        escalated_to: prev[caseId]?.escalated_to ?? "",
        [field]: value,
      },
    }));
  };

  const handleGovernanceSave = async (caseItem: any) => {
    if (!canOperateCases) return;
    const draft = governanceDrafts[caseItem.case_id] ?? {
      owner: caseItem.owner ?? "",
      remediation_action: caseItem.remediation_action ?? "",
      remediation_due_at: caseItem.remediation_due_at ?? "",
      resolution_notes: caseItem.resolution_notes ?? "",
      escalated_to: caseItem.escalated_to ?? "",
    };
    setSavingGovernanceId(caseItem.case_id);
    try {
      await updateCaseGovernance(caseItem.case_id, draft);
      await getCases().then((r) => setCasesData(r.data));
    } catch (_) { /* ignore */ }
    setSavingGovernanceId(null);
  };

  const handleAnchorCase = async (caseId: string, forceNew = false) => {
    if (!canOperateCases) return;
    setAnchoringId(caseId);
    try {
      await anchorCaseOnWeb3(caseId, {
        event_type: "case.risk.finding",
        commit_on_chain: true,
        force_new: forceNew,
      });
      await fetchProofs(caseId);
    } catch (_) { /* ignore */ }
    setAnchoringId(null);
  };

  const handleIssueBadge = async (caseId: string, forceNew = false) => {
    if (!canOperateCases) return;
    setIssuingBadgeId(caseId);
    try {
      await issueCaseBadge(caseId, {
        badge_type: "Audit Compliance Badge",
        commit_on_chain: true,
        force_new: forceNew,
      });
      await fetchBadges(caseId);
    } catch (_) { /* ignore */ }
    setIssuingBadgeId(null);
  };

  const copyToClipboard = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField((prev) => (prev === key ? null : prev)), 1200);
    } catch (_) { /* ignore */ }
  };

  const handleDownload = async (caseId: string) => {
    try {
      const resp = await explainCase(caseId);
      generateCasePDF(resp.data);
    } catch (err) {
      console.error("PDF download failed:", err);
    }
  };

  if (loading) return <ScanLoader text="LOADING CASES…" />;

  const cases: any[] = casesData?.cases ?? [];

  const sortCycles: Array<"risk_score" | "case_id" | "risk_label"> = ["risk_score", "case_id", "risk_label"];
  const toggleSort = (field: "risk_score" | "case_id" | "risk_label") => {
    if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir(field === "risk_score" ? "desc" : "asc"); }
  };

  const filtered = cases
    .filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (labelFilter !== "all" && c.risk_label !== labelFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = [c.case_id, c.vendor, c.risk_type, c.governance_area, c.effect, c.recommendation]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "risk_score") cmp = (a.risk_score ?? 0) - (b.risk_score ?? 0);
      else if (sortBy === "case_id") cmp = (a.case_id ?? "").localeCompare(b.case_id ?? "");
      else if (sortBy === "risk_label") {
        const order: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
        cmp = (order[a.risk_label] ?? 0) - (order[b.risk_label] ?? 0);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

  const stats = {
    total: cases.length,
    critical: cases.filter(c => c.risk_label === "CRITICAL").length,
    open: cases.filter(c => c.status === "open").length,
    closed: cases.filter(c => c.status === "closed").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Investigation Cases</h1>
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-mono">
            {cases.length} case{cases.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button onClick={fetch} className="text-muted-foreground hover:text-primary transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Startup info banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          Cases are pre-populated from server startup detection.{" "}
          <Link to="/risk" className="text-primary hover:underline">Run the AI agent pipeline</Link>
          {" "}on Risk Intelligence to generate investigation narratives and update findings.
        </p>
      </div>

      {/* Stat pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Cases", value: stats.total, color: "text-primary" },
          { label: "Critical", value: stats.critical, color: "text-cyber-crimson" },
          { label: "Open", value: stats.open, color: "text-cyber-amber" },
          { label: "Closed", value: stats.closed, color: "text-cyber-emerald" },
        ].map(s => (
          <div key={s.label} className="glass-panel p-4">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={cn("text-2xl font-mono font-bold", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by vendor, case ID, risk type…"
            className="w-full pl-9 pr-4 py-2 text-sm font-mono rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-muted-foreground mr-1">SORT</span>
          {(["risk_score", "case_id", "risk_label"] as const).map(field => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={cn(
                "text-[11px] font-mono px-2.5 py-1.5 rounded border transition-colors flex items-center gap-1",
                sortBy === field
                  ? "border-primary text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:border-primary/50"
              )}
            >
              {field.replace(/_/g, " ")}
              {sortBy === field && (
                <ArrowUpDown className="w-2.5 h-2.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground w-16 flex-shrink-0">STATUS</span>
          <FilterPill label="All" value="all" current={statusFilter} onClick={applyStatusFilter} />
          {VALID_STATUSES.map(s => (
            <FilterPill key={s} label={s.replace(/_/g, " ")} value={s} current={statusFilter} onClick={applyStatusFilter} />
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted-foreground w-16 flex-shrink-0">LABEL</span>
          <FilterPill label="All" value="all" current={labelFilter} onClick={applyLabelFilter} />
          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map(l => (
            <FilterPill key={l} label={l} value={l} current={labelFilter} onClick={applyLabelFilter} />
          ))}
        </div>
        <div className="text-xs font-mono text-muted-foreground">
          Showing <span className="text-foreground">{filtered.length}</span> of <span className="text-foreground">{cases.length}</span> cases
        </div>
      </div>

      {/* Cases */}
      {filtered.length === 0 && (
        <div className="glass-panel p-8 text-center text-muted-foreground">
          {cases.length === 0
            ? "No cases found. Run the audit pipeline to generate cases."
            : "No cases match the current filters."}
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((c: any) => {
          const StatusIcon = STATUS_ICONS[c.status] ?? AlertCircle;
          const expanded = expandedId === c.case_id;

          return (
            <div key={c.case_id} className="glass-panel overflow-hidden">
              {/* Case header row */}
              <div className="flex items-center gap-3 p-4">
                {/* Expand toggle */}
                <button
                  onClick={() => toggleExpanded(c.case_id)}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {/* Risk label badge */}
                <span className={cn("text-xs font-mono px-2 py-0.5 rounded flex-shrink-0", LABEL_COLORS[c.risk_label] ?? "")}>
                  {c.risk_label}
                </span>

                {/* Case info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{c.case_id}</span>
                    <span className="font-mono text-sm text-foreground truncate">{c.vendor}</span>
                    <span className={cn("text-xs capitalize", getRiskTextColor(c.risk_type))}>
                      {c.risk_type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-1 max-w-xs">
                    <RiskScoreBar score={c.risk_score} />
                  </div>
                </div>

                {/* Status badge */}
                <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono flex-shrink-0", STATUS_COLORS[c.status] ?? "")}>
                  <StatusIcon className="w-3 h-3" />
                  <span className="capitalize hidden sm:inline">{c.status.replace(/_/g, " ")}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleIssueBadge(c.case_id)}
                    title={canOperateCases ? "Issue NFT compliance badge" : "Read-only role: cannot issue badge"}
                    disabled={!canOperateCases || issuingBadgeId === c.case_id}
                    className="p-1.5 rounded hover:bg-cyber-amber/10 text-muted-foreground hover:text-cyber-amber transition-colors disabled:opacity-40"
                  >
                    <BadgeCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleAnchorCase(c.case_id)}
                    title={canOperateCases ? "Anchor case proof on Web3" : "Read-only role: cannot anchor"}
                    disabled={!canOperateCases || anchoringId === c.case_id}
                    className="p-1.5 rounded hover:bg-cyber-emerald/10 text-muted-foreground hover:text-cyber-emerald transition-colors disabled:opacity-40"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                  {(c.graph_path?.length ?? 0) > 0 && (
                    <button
                      onClick={() => handleViewInGraph(c)}
                      title="View pathway in graph"
                      className="p-1.5 rounded hover:bg-cyan-500/10 text-muted-foreground hover:text-cyan-400 transition-colors"
                    >
                      <Network className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setChatId(c.case_id); setExplainId(null); }}
                    title="Chat with AI about this case"
                    className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Bot className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setExplainId(c.case_id); setChatId(null); }}
                    title="Explain why flagged"
                    className="p-1.5 rounded hover:bg-cyber-amber/10 text-muted-foreground hover:text-cyber-amber transition-colors"
                  >
                    <Lightbulb className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setReportCaseId(c.case_id); setExplainId(null); setChatId(null); }}
                    title="Write audit report"
                    className="p-1.5 rounded hover:bg-cyber-amber/10 text-muted-foreground hover:text-cyber-amber transition-colors"
                  >
                    <FileEdit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(c.case_id)}
                    title="Download PDF explainability report"
                    className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div className="px-4 pb-4 pt-0 border-t border-border/20 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4 pt-4">

                    {/* Evidence */}
                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground mb-2">EVIDENCE</h4>
                      <ul className="space-y-1 text-sm">
                        {(c.evidence ?? []).map((e: string, i: number) => (
                          <li key={i} className="flex gap-2 text-foreground/80">
                            <span className="text-primary mt-1 flex-shrink-0">•</span>{e}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Effect + Recommendation */}
                    <div className="space-y-3">
                      {c.effect && (
                        <div className="p-3 rounded bg-cyber-amber/10 border border-cyber-amber/20 text-sm text-foreground/80">
                          <div className="text-xs font-mono text-cyber-amber mb-1">FINANCIAL EFFECT</div>
                          {c.effect}
                        </div>
                      )}
                      {c.recommendation && (
                        <div className="p-3 rounded bg-primary/10 border border-primary/20 text-sm text-foreground/80">
                          <div className="flex items-center gap-1 text-xs font-mono text-primary mb-1">
                            <Lightbulb className="w-3 h-3" />RECOMMENDATION
                          </div>
                          {c.recommendation}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Graph path */}
                  {c.graph_path?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground mb-2">DETECTION PATHWAY</h4>
                      <div className="flex items-center gap-1 flex-wrap">
                        {c.graph_path.map((n: string, i: number) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                            <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono text-foreground">{n}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-mono text-muted-foreground">WEB3 PROOF ANCHORS</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchProofs(c.case_id)}
                          className="text-xs font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                        >
                          Refresh
                        </button>
                        <button
                          onClick={() => handleAnchorCase(c.case_id, true)}
                          disabled={!canOperateCases || anchoringId === c.case_id}
                          title={canOperateCases ? "Create a fresh anchor even if hash already exists" : "Read-only role: cannot anchor"}
                          className="text-xs font-mono px-2 py-1 rounded border border-cyber-emerald/40 text-cyber-emerald hover:bg-cyber-emerald/10 transition-colors disabled:opacity-40"
                        >
                          {anchoringId === c.case_id ? "Anchoring..." : "Re-anchor"}
                        </button>
                      </div>
                    </div>

                    {proofLoadingByCase[c.case_id] && (
                      <div className="text-xs font-mono text-muted-foreground animate-pulse">Loading proof records...</div>
                    )}

                    {!proofLoadingByCase[c.case_id] && (proofsByCase[c.case_id]?.length ?? 0) === 0 && (
                      <div className="text-xs font-mono text-muted-foreground border border-border/30 rounded p-3 bg-muted/20">
                        No Web3 anchor yet for this case.
                      </div>
                    )}

                    {!proofLoadingByCase[c.case_id] && (proofsByCase[c.case_id]?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        {(proofsByCase[c.case_id] ?? []).map((proof: any) => (
                          <div key={proof.anchor_id} className="rounded border border-border/40 bg-muted/20 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded", PROOF_STATUS_COLORS[proof.status] ?? PROOF_STATUS_COLORS.pending)}>
                                {proof.status ?? "pending"}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded", PROOF_MODE_COLORS[getProofMode(proof.status).key] ?? PROOF_MODE_COLORS.queued)}>
                                  {getProofMode(proof.status).label}
                                </span>
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  {proof.created_at ? new Date(proof.created_at).toLocaleString() : "N/A"}
                                </span>
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-2 text-xs font-mono">
                              <div className="text-muted-foreground">Anchor ID</div>
                              <div className="text-foreground flex items-center gap-2">
                                <span>{shortHash(proof.anchor_id)}</span>
                                <button
                                  onClick={() => copyToClipboard(proof.anchor_id, `${proof.anchor_id}-anchor`)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                                  title="Copy anchor id"
                                >
                                  <Copy className="w-3 h-3" />
                                  {copiedField === `${proof.anchor_id}-anchor` ? "Copied" : "Copy"}
                                </button>
                              </div>
                              <div className="text-muted-foreground">Event Hash</div>
                              <div className="text-foreground">{shortHash(proof.event_hash)}</div>
                              <div className="text-muted-foreground">Network</div>
                              <div className="text-foreground">{proof.network ?? "not set"}</div>
                              <div className="text-muted-foreground">Transaction</div>
                              <div className="text-foreground flex items-center gap-2">
                                <span>{proof.tx_hash ? shortHash(proof.tx_hash) : "not submitted"}</span>
                                {proof.tx_hash && (
                                  <button
                                    onClick={() => copyToClipboard(proof.tx_hash, `${proof.anchor_id}-tx`)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                                    title="Copy transaction hash"
                                  >
                                    <Copy className="w-3 h-3" />
                                    {copiedField === `${proof.anchor_id}-tx` ? "Copied" : "Copy"}
                                  </button>
                                )}
                              </div>
                              <div className="text-muted-foreground">CID</div>
                              <div className="text-foreground break-all">{proof.ipfs_cid ?? "N/A"}</div>
                            </div>
                            {proof.error_message && (
                              <div className="text-xs text-cyber-amber border border-cyber-amber/30 bg-cyber-amber/10 rounded p-2">
                                {proof.error_message}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-mono text-muted-foreground">NFT COMPLIANCE BADGES</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchBadges(c.case_id)}
                          className="text-xs font-mono px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                        >
                          Refresh
                        </button>
                        <button
                          onClick={() => handleIssueBadge(c.case_id, true)}
                          disabled={!canOperateCases || issuingBadgeId === c.case_id}
                          title={canOperateCases ? "Issue a fresh badge even if one already exists" : "Read-only role: cannot issue badge"}
                          className="text-xs font-mono px-2 py-1 rounded border border-cyber-amber/40 text-cyber-amber hover:bg-cyber-amber/10 transition-colors disabled:opacity-40"
                        >
                          {issuingBadgeId === c.case_id ? "Issuing..." : "Re-issue Badge"}
                        </button>
                      </div>
                    </div>

                    {badgeLoadingByCase[c.case_id] && (
                      <div className="text-xs font-mono text-muted-foreground animate-pulse">Loading badge records...</div>
                    )}

                    {!badgeLoadingByCase[c.case_id] && (badgesByCase[c.case_id]?.length ?? 0) === 0 && (
                      <div className="text-xs font-mono text-muted-foreground border border-border/30 rounded p-3 bg-muted/20">
                        No badge minted yet. Minting requires at least one case anchor.
                      </div>
                    )}

                    {!badgeLoadingByCase[c.case_id] && (badgesByCase[c.case_id]?.length ?? 0) > 0 && (
                      <div className="space-y-2">
                        {(badgesByCase[c.case_id] ?? []).map((badge: any) => (
                          <div key={badge.badge_id} className="rounded border border-border/40 bg-muted/20 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded", PROOF_STATUS_COLORS[badge.status] ?? PROOF_STATUS_COLORS.pending)}>
                                {badge.status ?? "pending"}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded", PROOF_MODE_COLORS[getBadgeMode(badge.status).key] ?? PROOF_MODE_COLORS.queued)}>
                                  {getBadgeMode(badge.status).label}
                                </span>
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  {badge.created_at ? new Date(badge.created_at).toLocaleString() : "N/A"}
                                </span>
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-2 text-xs font-mono">
                              <div className="text-muted-foreground">Badge ID</div>
                              <div className="text-foreground flex items-center gap-2">
                                <span>{badge.badge_id ?? "N/A"}</span>
                                {badge.badge_id && (
                                  <button
                                    onClick={() => copyToClipboard(badge.badge_id, `${badge.badge_id}-id`)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                                    title="Copy badge id"
                                  >
                                    <Copy className="w-3 h-3" />
                                    {copiedField === `${badge.badge_id}-id` ? "Copied" : "Copy"}
                                  </button>
                                )}
                              </div>
                              <div className="text-muted-foreground">Token ID</div>
                              <div className="text-foreground">{String(badge.token_id ?? "N/A")}</div>
                              <div className="text-muted-foreground">Anchor Link</div>
                              <div className="text-foreground">{shortHash(badge.anchor_id)}</div>
                              <div className="text-muted-foreground">Recipient</div>
                              <div className="text-foreground">{badge.recipient_wallet ? shortHash(badge.recipient_wallet) : "not set"}</div>
                              <div className="text-muted-foreground">Transaction</div>
                              <div className="text-foreground flex items-center gap-2">
                                <span>{badge.tx_hash ? shortHash(badge.tx_hash) : "not submitted"}</span>
                                {badge.tx_hash && (
                                  <button
                                    onClick={() => copyToClipboard(badge.tx_hash, `${badge.badge_id}-tx`)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                                    title="Copy badge transaction hash"
                                  >
                                    <Copy className="w-3 h-3" />
                                    {copiedField === `${badge.badge_id}-tx` ? "Copied" : "Copy"}
                                  </button>
                                )}
                              </div>
                              <div className="text-muted-foreground">Metadata URI</div>
                              <div className="text-foreground break-all">{badge.metadata_uri ?? "N/A"}</div>
                            </div>
                            {badge.error_message && (
                              <div className="text-xs text-cyber-amber border border-cyber-amber/30 bg-cyber-amber/10 rounded p-2">
                                {badge.error_message}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="p-3 rounded bg-primary/10 border border-primary/20 text-sm text-foreground/80">
                        <div className="text-xs font-mono text-primary mb-1">GOVERNANCE AREA</div>
                        {c.governance_area ?? "Unmapped governance area"}
                      </div>
                      <div className="p-3 rounded bg-muted/30 border border-border/30 text-sm text-foreground/80">
                        <div className="text-xs font-mono text-muted-foreground mb-1">ROOT CAUSE</div>
                        {c.root_cause ?? "No root cause recorded."}
                      </div>
                      {!!c.control_ids?.length && (
                        <div>
                          <h4 className="text-xs font-mono text-muted-foreground mb-2">IMPLICATED CONTROLS</h4>
                          <div className="flex flex-wrap gap-2">
                            {c.control_ids.map((controlId: string) => (
                              <span key={controlId} className="px-2 py-1 rounded bg-cyber-amber/10 border border-cyber-amber/20 text-cyber-amber text-xs font-mono">
                                {controlId}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-mono text-muted-foreground">REMEDIATION WORKFLOW</h4>
                      {!canOperateCases && (
                        <div className="text-xs font-mono text-cyber-amber bg-cyber-amber/10 border border-cyber-amber/20 rounded p-2">
                          Read-only mode for your role. Only admins and risk analysts can edit remediation fields.
                        </div>
                      )}
                      <input
                        value={governanceDrafts[c.case_id]?.owner ?? c.owner ?? ""}
                        onChange={(e) => updateGovernanceDraft(c.case_id, "owner", e.target.value)}
                        placeholder="Case owner"
                        disabled={!canOperateCases}
                        className="w-full text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground"
                      />
                      <input
                        value={governanceDrafts[c.case_id]?.escalated_to ?? c.escalated_to ?? ""}
                        onChange={(e) => updateGovernanceDraft(c.case_id, "escalated_to", e.target.value)}
                        placeholder="Escalated to"
                        disabled={!canOperateCases}
                        className="w-full text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground"
                      />
                      <input
                        type="date"
                        value={governanceDrafts[c.case_id]?.remediation_due_at ?? c.remediation_due_at ?? ""}
                        onChange={(e) => updateGovernanceDraft(c.case_id, "remediation_due_at", e.target.value)}
                        disabled={!canOperateCases}
                        className="w-full text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground"
                      />
                      <textarea
                        value={governanceDrafts[c.case_id]?.remediation_action ?? c.remediation_action ?? ""}
                        onChange={(e) => updateGovernanceDraft(c.case_id, "remediation_action", e.target.value)}
                        placeholder="Remediation action"
                        disabled={!canOperateCases}
                        className="w-full min-h-[80px] text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground"
                      />
                      <textarea
                        value={governanceDrafts[c.case_id]?.resolution_notes ?? c.resolution_notes ?? ""}
                        onChange={(e) => updateGovernanceDraft(c.case_id, "resolution_notes", e.target.value)}
                        placeholder="Resolution notes"
                        disabled={!canOperateCases}
                        className="w-full min-h-[80px] text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground"
                      />
                      <button
                        onClick={() => handleGovernanceSave(c)}
                        disabled={savingGovernanceId === c.case_id || !canOperateCases}
                        className="text-xs font-mono px-3 py-2 rounded bg-primary text-background hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {savingGovernanceId === c.case_id ? "Saving…" : "Save Governance"}
                      </button>
                    </div>
                  </div>

                  {/* Timeline + Status update */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground mb-2">CASE TIMELINE</h4>
                      <div className="space-y-1.5">
                        {(c.timeline ?? []).map((ev: any, i: number) => (
                          <div key={i} className="flex gap-2 text-xs">
                            <span className="text-muted-foreground font-mono flex-shrink-0">
                              {new Date(ev.at).toLocaleString()}
                            </span>
                            <span className="text-foreground/80">{ev.event}</span>
                            <span className="text-muted-foreground">({ev.by})</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-mono text-muted-foreground mb-2">UPDATE STATUS</h4>
                      <select
                        value={c.status}
                        disabled={updatingId === c.case_id || !canOperateCases}
                        onChange={e => handleStatusChange(c.case_id, e.target.value)}
                        className="w-full text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
                      >
                        {VALID_STATUSES.map(s => (
                          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                      {updatingId === c.case_id && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono animate-pulse">Updating…</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Explain panel (slide-over) */}
      {explainId && <ExplainPanel caseId={explainId} onClose={() => setExplainId(null)} />}

      {/* AI Chat panel (slide-over) */}
      {chatId && <ChatPanel caseId={chatId} onClose={() => setChatId(null)} />}

      {/* Report writing panel (slide-over) */}
      {reportCaseId && (() => {
        const reportCase = cases.find(c => c.case_id === reportCaseId);
        return reportCase ? (
          <ReportWritingPanel caseItem={reportCase} onClose={() => setReportCaseId(null)} />
        ) : null;
      })()}
    </div>
  );
}

// ─── Auditor Report Writing Panel ────────────────────────────────────────────

function ReportWritingPanel({ caseItem, onClose }: { caseItem: any; onClose: () => void }) {
  const userName = useAuditStore((s) => s.userName);
  const [title, setTitle] = useState(`Audit Investigation Report — ${caseItem.case_id}`);
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [detailedFindings, setDetailedFindings] = useState("");
  const [riskAssessment, setRiskAssessment] = useState("");
  const [recommendedActions, setRecommendedActions] = useState(caseItem.recommendation ?? "");
  const [auditorName, setAuditorName] = useState(userName ?? "");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      generateAuditorReport({ caseItem, title, executiveSummary, detailedFindings, riskAssessment, recommendedActions, auditorName, reportDate });
      setGenerating(false);
    }, 50);
  };

  const fieldClass = "w-full text-sm font-mono px-3 py-2 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";
  const areaClass = `${fieldClass} resize-none min-h-[80px]`;

  return (
    <div className="fixed inset-y-0 right-0 w-[540px] z-50 bg-card border-l border-border shadow-2xl flex flex-col animate-slide-up">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-cyber-amber" />
          <span className="font-mono text-sm font-bold text-cyber-amber">WRITE AUDIT REPORT</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Case banner */}
      <div className="px-5 py-2.5 bg-muted/30 border-b border-border/40 flex-shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-mono text-foreground">{caseItem.case_id} · {caseItem.vendor}</span>
          <span className={cn("text-xs font-mono px-2 py-0.5 rounded", LABEL_COLORS[caseItem.risk_label] ?? "")}>
            {caseItem.risk_label}
          </span>
        </div>
        <span className="text-xs font-mono text-muted-foreground capitalize">{(caseItem.risk_type ?? "").replace(/_/g, " ")}</span>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1 uppercase tracking-wider">Report Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={fieldClass} />
        </div>

        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1 uppercase tracking-wider">Executive Summary</label>
          <textarea
            value={executiveSummary}
            onChange={e => setExecutiveSummary(e.target.value)}
            placeholder="High-level summary of this investigation case and its significance…"
            className={areaClass}
          />
        </div>

        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1 uppercase tracking-wider">Detailed Findings</label>
          <textarea
            value={detailedFindings}
            onChange={e => setDetailedFindings(e.target.value)}
            placeholder="Specific anomalies observed, supporting evidence, and the control failure pathway…"
            className={areaClass}
          />
        </div>

        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1 uppercase tracking-wider">Risk Assessment</label>
          <textarea
            value={riskAssessment}
            onChange={e => setRiskAssessment(e.target.value)}
            placeholder="Impact, likelihood, and severity of the identified governance risk…"
            className={areaClass}
          />
        </div>

        <div>
          <label className="text-[10px] font-mono text-muted-foreground block mb-1 uppercase tracking-wider">Recommended Actions</label>
          <textarea
            value={recommendedActions}
            onChange={e => setRecommendedActions(e.target.value)}
            placeholder="Specific remediation steps and control improvements to implement…"
            className={areaClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1 uppercase tracking-wider">Auditor Name</label>
            <input value={auditorName} onChange={e => setAuditorName(e.target.value)} className={fieldClass} placeholder="Your name" />
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1 uppercase tracking-wider">Report Date</label>
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className={fieldClass} />
          </div>
        </div>

        {/* Case evidence preview */}
        {(caseItem.evidence ?? []).length > 0 && (
          <div className="rounded border border-border/40 bg-muted/20 p-3 space-y-1">
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">System Evidence (auto-included)</div>
            {(caseItem.evidence ?? []).slice(0, 3).map((e: string, i: number) => (
              <div key={i} className="flex gap-2 text-xs text-foreground/70">
                <span className="text-primary flex-shrink-0 mt-0.5">•</span>{e}
              </div>
            ))}
            {(caseItem.evidence ?? []).length > 3 && (
              <div className="text-xs text-muted-foreground font-mono">+ {(caseItem.evidence ?? []).length - 3} more items</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4 flex-shrink-0 space-y-2">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-cyber-amber text-background font-mono text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {generating ? "Generating…" : "Download PDF Report"}
        </button>
        <p className="text-center text-[10px] font-mono text-muted-foreground">
          Report includes your narrative + case evidence + detection pathway
        </p>
      </div>
    </div>
  );
}

function FilterPill({ label, value, current, onClick }: { label: string; value: string; current: string; onClick: (v: string) => void }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "text-xs font-mono px-3 py-1.5 rounded border transition-all capitalize",
        active
          ? "border-primary bg-primary text-background font-semibold"
          : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
      )}
    >
      {label}
    </button>
  );
}
