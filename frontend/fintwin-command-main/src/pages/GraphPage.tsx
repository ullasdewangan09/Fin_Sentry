import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuditStore } from "@/store/useAuditStore";
import { getGraphData, searchVendors, getVendorSubgraph } from "@/lib/api";
import { ScanLoader } from "@/components/ScanLoader";
import { RefreshCw, X, AlertTriangle, ChevronRight, Search, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIndianCurrency } from "@/lib/formatting";

// ─── Node type styling ────────────────────────────────────────────────────────

const NODE_TYPE_CONFIG: Record<
  string,
  { border: string; bg: string; text: string; shape: "circle" | "rect" }
> = {
  policy:            { border: "#7c3aed", bg: "#0A0B0F", text: "#c084fc", shape: "rect"   },
  control:           { border: "#f97316", bg: "#0A0B0F", text: "#fb923c", shape: "rect"   },
  org_role:          { border: "#22c55e", bg: "#0A0B0F", text: "#4ade80", shape: "rect"   },
  employee:          { border: "#00E676", bg: "#0A0B0F", text: "#00E676", shape: "circle" },
  vendor:            { border: "#00D4FF", bg: "#0A0B0F", text: "#00D4FF", shape: "rect"   },
  vendor_creation:   { border: "#00BCD4", bg: "#0A0B0F", text: "#00BCD4", shape: "rect"   },
  invoice:           { border: "#FFB800", bg: "#0A0B0F", text: "#FFB800", shape: "rect"   },
  approval_decision: { border: "#4F8EF7", bg: "#0A0B0F", text: "#4F8EF7", shape: "rect"   },
  payment_decision:  { border: "#14b8a6", bg: "#0A0B0F", text: "#2dd4bf", shape: "rect"   },
  transaction:       { border: "#B44FFF", bg: "#0A0B0F", text: "#B44FFF", shape: "circle" },
};

const RISK_STYLE = {
  borderColor: "#FF3B5C",
  boxShadow: "0 0 18px #FF3B5C80",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  defines_control: "#fb923c70",
  holds_role:    "#22c55e70",
  performed:    "#00E67660",
  onboarded:    "#00BCD460",
  issued:       "#00D4FF40",
  has_approval: "#4F8EF760",
  approved_by:  "#4F8EF740",
  governed_by:  "#fb923c70",
  monitored_by: "#f59e0b70",
  ready_for_payment: "#2dd4bf70",
  authorized_payment: "#14b8a670",
  authorized_by: "#22c55e70",
  violates_if_missing: "#ef444470",
  paid_by:      "#B44FFF60",
};

// Row order (top → bottom)
const ROW_ORDER = [
  "policy", "control", "org_role", "employee",
  "vendor_creation", "vendor", "invoice", "approval_decision", "payment_decision", "transaction",
];
const Y_GAP = 190;
const X_GAP = 110;

// ─── Build React Flow nodes from backend payload ──────────────────────────────

function buildNodes(backendNodes: any[], riskSet: Set<string>): Node[] {
  // Group by node_type
  const groups: Record<string, any[]> = {};
  for (const n of backendNodes) {
    const t = n.node_type ?? "unknown";
    if (!groups[t]) groups[t] = [];
    groups[t].push(n);
  }

  const nodes: Node[] = [];
  ROW_ORDER.forEach((type, rowIdx) => {
    const items = groups[type] ?? [];
    const startX = -(items.length * X_GAP) / 2;
    items.forEach((item, colIdx) => {
      const cfg = NODE_TYPE_CONFIG[type] ?? { border: "#666", bg: "#0A0B0F", text: "#ccc", shape: "rect" };
      const isRisk = riskSet.has(item.id);
      const isCircle = cfg.shape === "circle";

      // Short label: prefer id, trim long vendor/ad ids
      let label = item.id as string;
      if (label.startsWith("AD-")) label = label.replace("AD-", "");
      if (label.startsWith("vc_")) label = label.replace("vc_", "vc:");

      nodes.push({
        id: item.id,
        type: "default",
        position: { x: startX + colIdx * X_GAP, y: rowIdx * Y_GAP },
        data: { label, ...item },
        style: {
          background: cfg.bg,
          border: `2px ${isRisk ? "dashed" : "solid"} ${isRisk ? RISK_STYLE.borderColor : cfg.border}`,
          color: cfg.text,
          borderRadius: isCircle ? "50%" : "6px",
          fontSize: "9px",
          fontFamily: "JetBrains Mono, monospace",
          padding: "6px",
          width: isCircle ? 72 : 84,
          height: isCircle ? 72 : 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          ...(isRisk ? { boxShadow: RISK_STYLE.boxShadow } : {}),
        },
      });
    });
  });

  return nodes;
}

function buildEdges(backendEdges: any[]): Edge[] {
  return backendEdges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
    style: {
      stroke: EDGE_TYPE_COLORS[e.edge_type] ?? "#00D4FF30",
      strokeWidth: 1,
    },
  }));
}

// ─── Node detail panel ────────────────────────────────────────────────────────

function NodeDetail({ node, onClose }: { node: any; onClose: () => void }) {
  const attrs = node.data as Record<string, any>;
  const skip = new Set(["id", "label"]);
  const entries = Object.entries(attrs).filter(([k]) => !skip.has(k));

  const fmtValue = (k: string, v: any) => {
    if (v == null) return "—";
    if ((k === "amount" || k.includes("amount")) && typeof v === "number") {
      return formatIndianCurrency(v);
    }
    return String(v);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[340px] z-50 bg-card border-l border-border shadow-2xl p-5 overflow-y-auto animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-sm text-primary font-bold">{node.id}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 text-xs">
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-mono uppercase tracking-wide">{k.replace(/_/g, " ")}</span>
            <span className="text-foreground font-mono break-all">{fmtValue(k, v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ nodeTypes }: { nodeTypes: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono">
      {Object.entries(NODE_TYPE_CONFIG).map(([type, cfg]) => (
        <span key={type} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm border"
            style={{ borderColor: cfg.border }}
          />
          <span style={{ color: cfg.text }}>{type.replace(/_/g, " ")}</span>
          {nodeTypes[type] != null && (
            <span className="text-muted-foreground">({nodeTypes[type]})</span>
          )}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm border border-dashed border-[#FF3B5C]" />
        <span className="text-[#FF3B5C]">risk node</span>
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const { graphData, setGraphData, highlightedPath, highlightedCaseId, setHighlightedPath, setHighlightedCaseId } = useAuditStore();
  const [loading, setLoading] = useState(!graphData);
  const [showRiskOnly, setShowRiskOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "governance" | "operational">("all");
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [phase, setPhase] = useState(0);

  // Vendor search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedVendorSubgraph, setSelectedVendorSubgraph] = useState<any | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const fetch = (force = false) => {
    setLoading(true);
    getGraphData()
      .then(r => {
        setGraphData(r.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const handleVendorSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const r = await searchVendors(q);
      setSearchResults(r.data.vendors ?? []);
    } catch (_) { setSearchResults([]); }
    setSearchLoading(false);
  };

  const handleSelectVendor = async (vendorId: string) => {
    setSearchResults(null);
    setSearchQuery("");
    try {
      const r = await getVendorSubgraph(vendorId);
      setSelectedVendorSubgraph(r.data);
    } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    if (!graphData) fetch();
    else setLoading(false);
  }, []);

  // Build React Flow nodes & edges whenever graphData changes
  const allNodes = useMemo(() => {
    if (!graphData) return [];
    const riskSet = new Set<string>(graphData.risk_node_ids ?? []);
    return buildNodes(graphData.nodes ?? [], riskSet);
  }, [graphData]);

  const allEdges = useMemo(() => {
    if (!graphData) return [];
    return buildEdges(graphData.edges ?? []);
  }, [graphData]);

  const riskSet = useMemo(
    () => new Set<string>(graphData?.risk_node_ids ?? []),
    [graphData]
  );

  const nodeTypes: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of graphData?.nodes ?? []) {
      const t = n.node_type ?? "unknown";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [graphData]);

  // Phased reveal animation
  useEffect(() => {
    if (loading || allNodes.length === 0) return;
    setNodes([]);
    setEdges([]);
    setPhase(0);

    // Group node indices by row
    const rowNodes = ROW_ORDER.map(type =>
      allNodes.filter(n => (n.data as any).node_type === type)
    );

    let cumulative: Set<string> = new Set();
    rowNodes.forEach((row, i) => {
      setTimeout(() => {
        setPhase(i + 1);
        for (const n of row) cumulative.add(n.id);
        const visible = new Set(cumulative);
        setNodes(allNodes.filter(n => visible.has(n.id)));
        setEdges(allEdges.filter(e => visible.has(e.source) && visible.has(e.target)));
      }, i * 400);
    });
  }, [allNodes, allEdges, loading]);

  const filteredNodes = useMemo(() => {
    const governanceTypes = new Set(["policy", "control", "org_role", "employee", "vendor_creation", "approval_decision", "payment_decision"]);
    const operationalTypes = new Set(["employee", "vendor", "vendor_creation", "invoice", "approval_decision", "payment_decision", "transaction"]);
    const pathSet = new Set<string>(highlightedPath ?? []);
    return nodes
      .filter((n) => {
        const nodeType = (n.data as any).node_type as string;
        if (viewMode === "governance") return governanceTypes.has(nodeType);
        if (viewMode === "operational") return operationalTypes.has(nodeType);
        return true;
      })
      .map(n => {
      const inPath = pathSet.has(n.id);
      const dimmed = showRiskOnly && !riskSet.has(n.id);
      return {
        ...n,
        style: {
          ...n.style,
          opacity: dimmed && !inPath ? 0.15 : 1,
          ...(inPath ? {
            border: "3px solid #FFB800",
            boxShadow: "0 0 22px #FFB80090, 0 0 8px #FFB80060",
          } : {}),
        },
      };
    });
  }, [nodes, showRiskOnly, riskSet, highlightedPath, viewMode]);

  const displayEdges = useMemo(() => {
    const visibleIds = new Set(filteredNodes.map((node) => node.id));
    const scopedEdges = edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    if (!highlightedPath || highlightedPath.length < 2) return scopedEdges;
    const pathSet = new Set(highlightedPath);
    return scopedEdges.map(e =>
      pathSet.has(e.source) && pathSet.has(e.target)
        ? { ...e, style: { stroke: "#FFB800", strokeWidth: 2.5 }, animated: true }
        : e
    );
  }, [edges, highlightedPath, filteredNodes]);

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    setSelectedNode(prev => (prev?.id === node.id ? null : node));
  }, []);

  if (loading) return <ScanLoader text="LOADING GRAPH…" />;

  const stats = graphData?.stats ?? {};
  const riskCount = graphData?.risk_node_ids?.length ?? 0;

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/30 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <h1 className="text-lg font-bold text-foreground">Financial Digital Twin Graph</h1>
          {/* Live stats */}
          <div className="flex gap-3 text-xs font-mono text-muted-foreground">
            <span className="text-primary">{stats.total_nodes ?? 0} nodes</span>
            <span>·</span>
            <span>{stats.total_edges ?? 0} edges</span>
            {riskCount > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-[#FF3B5C]">
                  <AlertTriangle className="w-3 h-3" />
                  {riskCount} risk nodes
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded border border-border px-1 py-1">
            {[
              ["all", "All"],
              ["governance", "Control View"],
              ["operational", "Flow View"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as "all" | "governance" | "operational")}
                className={cn(
                  "text-[11px] font-mono px-2 py-1 rounded transition-colors",
                  viewMode === mode ? "bg-primary text-background" : "text-muted-foreground hover:text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Vendor search */}
          <div className="relative">
            <div className="flex items-center gap-1.5 border border-border rounded px-2 py-1 bg-background">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder="Search vendor…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); handleVendorSearch(e.target.value); }}
                className="bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none w-32"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchResults(null); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {/* Dropdown results */}
            {searchResults !== null && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded shadow-xl z-50 max-h-60 overflow-y-auto">
                {searchLoading && <div className="p-3 text-xs text-muted-foreground font-mono">Searching…</div>}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">No vendors found.</div>
                )}
                {searchResults.map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVendor(v.id)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary/10 text-left"
                  >
                    <div>
                      <div className="text-xs font-mono text-foreground">{v.name}</div>
                      <div className="text-[10px] text-muted-foreground">{v.id} · {v.invoice_count} invoices</div>
                    </div>
                    {v.has_risk && <AlertTriangle className="w-3 h-3 text-[#FF3B5C] flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowRiskOnly(!showRiskOnly)}
            className={cn(
              "text-xs font-mono px-3 py-1 rounded border transition-colors",
              showRiskOnly
                ? "border-[#FF3B5C] text-[#FF3B5C]"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary"
            )}
          >
            {showRiskOnly ? "Show All" : "Risk Paths Only"}
          </button>
          <button
            onClick={() => { setGraphData(null); fetch(true); }}
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Refresh graph"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Highlighted path banner */}
      {highlightedPath && highlightedPath.length > 0 && (
        <div className="px-6 py-2 border-b border-[#FFB800]/30 bg-[#FFB800]/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-[#FFB800]">
            <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Showing detection pathway for{" "}
              <span className="font-bold">{highlightedCaseId}</span>
              {" "}— {highlightedPath.length} nodes highlighted in gold
            </span>
          </div>
          <button
            onClick={() => { setHighlightedPath(null); setHighlightedCaseId(null); }}
            className="text-[#FFB800] hover:text-foreground ml-4 flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="px-6 py-2 border-b border-border/20 bg-card/50">
        <Legend nodeTypes={nodeTypes} />
      </div>

      {/* Phase progress */}
      {phase < ROW_ORDER.length && (
        <div className="px-6 py-1.5 border-b border-border/20 bg-background/60">
          <div className="flex gap-1.5 text-[10px] font-mono text-muted-foreground">
            {ROW_ORDER.map((t, i) => (
              <span
                key={t}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded transition-colors",
                  i < phase ? "text-cyber-emerald" : "text-muted-foreground/40"
                )}
              >
                {i < phase && "✓"} {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={filteredNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: "#0A0B0F" }}
        >
          <Background color="#00D4FF0A" gap={30} />
          <Controls className="!bg-card !border-border" />
          <MiniMap
            nodeColor={(n) => {
              if (riskSet.has(n.id)) return "#FF3B5C";
              const type = (n.data as any)?.node_type as string;
              return NODE_TYPE_CONFIG[type]?.border ?? "#333";
            }}
            style={{ background: "#0A0B0F", border: "1px solid #1e2030" }}
          />
        </ReactFlow>

        {/* Node detail side panel */}
        {selectedNode && !selectedVendorSubgraph && (
          <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}

        {/* Vendor subgraph panel */}
        {selectedVendorSubgraph && (
          <div className="fixed inset-y-0 right-0 w-[380px] z-50 bg-card border-l border-border shadow-2xl overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-mono text-sm font-bold text-primary">{selectedVendorSubgraph.vendor_name}</div>
                <div className="text-xs text-muted-foreground font-mono">{selectedVendorSubgraph.vendor_id}</div>
              </div>
              <button onClick={() => setSelectedVendorSubgraph(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-5 text-sm">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-panel p-3 text-center">
                  <div className="text-xl font-mono font-bold text-primary">{selectedVendorSubgraph.stats?.nodes ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Subgraph Nodes</div>
                </div>
                <div className="glass-panel p-3 text-center">
                  <div className="text-xl font-mono font-bold text-primary">{selectedVendorSubgraph.stats?.edges ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Connections</div>
                </div>
              </div>

              {/* Risk findings for this vendor */}
              {selectedVendorSubgraph.risk_findings?.length > 0 && (
                <div>
                  <h4 className="text-xs font-mono text-cyber-crimson mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> RISK FINDINGS ({selectedVendorSubgraph.risk_findings.length})
                  </h4>
                  {selectedVendorSubgraph.risk_findings.map((f: any, i: number) => (
                    <div key={i} className="p-3 rounded bg-cyber-crimson/10 border border-cyber-crimson/20 mb-2">
                      <div className="font-mono text-xs text-cyber-crimson capitalize mb-1">{f.risk_type.replace(/_/g, " ")}</div>
                      <div className="text-xs text-foreground/80">{f.policy_violation}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Subgraph node list */}
              <div>
                <h4 className="text-xs font-mono text-muted-foreground mb-2">SUBGRAPH NODES</h4>
                <div className="space-y-1.5">
                  {selectedVendorSubgraph.nodes?.map((n: any) => {
                    const isRisk = selectedVendorSubgraph.risk_node_ids?.includes(n.id);
                    return (
                      <div key={n.id} className={cn("flex items-center justify-between text-xs px-2 py-1.5 rounded", isRisk ? "bg-cyber-crimson/10" : "bg-muted/30")}>
                        <div>
                          <span className="font-mono text-foreground">{n.id}</span>
                          {n.name && <span className="ml-2 text-muted-foreground">{n.name}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground capitalize">{(n.node_type ?? "").replace(/_/g, " ")}</span>
                          {isRisk && <AlertTriangle className="w-3 h-3 text-cyber-crimson" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
