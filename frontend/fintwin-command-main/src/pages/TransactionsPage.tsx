import { useEffect, useState } from "react";
import { useAuditStore } from "@/store/useAuditStore";
import { testTransactions, explainTransaction } from "@/lib/api";
import { ScanLoader } from "@/components/ScanLoader";
import { formatIndianCurrency } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { RefreshCw, FileText, CheckCircle, Crown, Scale, Lock, X, ShieldCheck, Loader2 } from "lucide-react";

const controlIcons = [
  { label: "CTRL-1: Invoice Exists",        icon: FileText    },
  { label: "CTRL-2: Approval Exists",       icon: CheckCircle },
  { label: "CTRL-3: Approver Authority",    icon: Crown       },
  { label: "CTRL-4: Amount Matches Invoice", icon: Scale      },
  { label: "CTRL-5: Segregation of Duties", icon: Lock       },
];

export default function TransactionsPage() {
  const { transactionReport, setTransactionReport } = useAuditStore();
  const [loading, setLoading] = useState(!transactionReport);
  const [filter, setFilter] = useState<"ALL" | "PASS" | "FAIL">("ALL");
  const [ctrlFilter, setCtrlFilter] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [explainData, setExplainData] = useState<any>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  useEffect(() => {
    if (transactionReport) { setLoading(false); return; }
    testTransactions().then(r => { setTransactionReport(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setExplainData(null);
    setExplainLoading(false);
    if (selectedTx?.overall_status === "PASS") {
      setExplainLoading(true);
      explainTransaction(selectedTx.transaction_id)
        .then(r => { setExplainData(r.data); setExplainLoading(false); })
        .catch(() => setExplainLoading(false));
    }
  }, [selectedTx]);

  const refresh = () => {
    setLoading(true);
    testTransactions().then(r => { setTransactionReport(r.data); setLoading(false); }).catch(() => setLoading(false));
  };

  if (loading) return <ScanLoader text="TESTING TRANSACTIONS…" />;

  const summary = transactionReport?.summary;
  const results: any[] = transactionReport?.results ?? [];

  const filtered = results.filter(r => {
    if (filter === "PASS" && r.overall_status !== "PASS") return false;
    if (filter === "FAIL" && r.overall_status !== "FAIL") return false;
    if (ctrlFilter) {
      const ctrl = r.controls?.find((c: any) => c.control === ctrlFilter);
      if (!ctrl || ctrl.status !== "FAIL") return false;
    }
    return true;
  });

  // pass_rate comes as "57.1%" string from the backend
  const passRateRaw = summary?.pass_rate ?? "0%";
  const passRateNum = parseFloat(String(passRateRaw)) || 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Transaction Controls</h1>
        <button onClick={refresh} className="text-muted-foreground hover:text-primary transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap gap-3">
        <Pill label="Total Tested"  value={summary?.total_transactions ?? 0} />
        <Pill label="Fully Passed"  value={summary?.fully_passed ?? 0}        color="text-cyber-emerald" />
        <Pill label="Has Failures"  value={summary?.has_failures ?? 0}        color="text-cyber-crimson" />
        <Pill
          label="Pass Rate"
          value={passRateRaw}
          color={passRateNum >= 80 ? "text-cyber-emerald" : passRateNum >= 50 ? "text-cyber-amber" : "text-cyber-crimson"}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["ALL", "PASS", "FAIL"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "text-xs font-mono px-3 py-1.5 rounded border transition-colors",
              filter === f ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >{f}</button>
        ))}
        <select
          value={ctrlFilter ?? ""}
          onChange={e => setCtrlFilter(e.target.value || null)}
          className="text-xs font-mono px-3 py-1.5 rounded border border-border bg-background text-foreground"
        >
          <option value="">All Controls</option>
          {controlIcons.map(c => (
            <option key={c.label} value={c.label}>{c.label}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto font-mono">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Transaction grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((tx: any) => {
          const failingControls = tx.controls?.filter((c: any) => c.status === "FAIL") ?? [];
          return (
            <button
              key={tx.transaction_id}
              onClick={() => setSelectedTx(tx)}
              className="glass-panel p-4 text-left hover:border-primary/30 transition-colors space-y-3"
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-base text-foreground">{tx.transaction_id}</span>
                <span className={cn(
                  "risk-badge",
                  tx.overall_status === "PASS"
                    ? "bg-cyber-emerald/20 text-cyber-emerald"
                    : "bg-cyber-crimson/20 text-cyber-crimson"
                )}>
                  {tx.overall_status}
                </span>
              </div>

              {/* Amount + date */}
              <div className="text-xs font-mono text-muted-foreground space-y-0.5">
                {tx.amount != null && (
                  <div className="text-foreground/70">{formatIndianCurrency(tx.amount)}</div>
                )}
                {tx.date && <div>{String(tx.date).split(" ")[0]}</div>}
                {tx.invoice_id && <div>Invoice: {tx.invoice_id}</div>}
              </div>

              {/* Control icons */}
              <div className="flex items-center gap-2">
                {controlIcons.map((ctrl) => {
                  const c = tx.controls?.find((c: any) => c.control === ctrl.label);
                  const pass = c?.status === "PASS";
                  return (
                    <div key={ctrl.label} title={`${ctrl.label}: ${c?.status ?? "N/A"}`}>
                      <ctrl.icon className={cn("w-4 h-4", pass ? "text-cyber-emerald" : "text-cyber-crimson")} />
                    </div>
                  );
                })}
              </div>

              {/* Failing control labels */}
              {failingControls.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {failingControls.map((c: any) => (
                    <span key={c.control} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyber-crimson/10 text-cyber-crimson border border-cyber-crimson/20">
                      {c.control}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No transactions match the selected filter.</div>
      )}

      {/* Detail modal */}
      {selectedTx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={() => setSelectedTx(null)}
        >
          <div
            className="glass-panel p-6 w-full max-w-lg mx-4 overflow-y-auto max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-xl text-foreground">{selectedTx.transaction_id}</span>
              <button onClick={() => setSelectedTx(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadata */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground mb-4">
              {selectedTx.amount != null && <span>{formatIndianCurrency(selectedTx.amount)}</span>}
              {selectedTx.date && <span>{String(selectedTx.date).split(" ")[0]}</span>}
              {selectedTx.invoice_id && <span>Invoice {selectedTx.invoice_id}</span>}
              {selectedTx.vendor_id && <span>Vendor {selectedTx.vendor_id}</span>}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs font-mono">
                  <th className="text-left pb-2">Control</th>
                  <th className="text-left pb-2">Status</th>
                  <th className="text-left pb-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {selectedTx.controls?.map((c: any, i: number) => (
                  <tr key={i} className="border-t border-border/30">
                    <td className="py-2 font-mono text-foreground/80">{c.control}</td>
                    <td className={cn("py-2 font-mono", c.status === "PASS" ? "text-cyber-emerald" : "text-cyber-crimson")}>
                      {c.status}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Why Not Flagged — explainability for PASS transactions */}
            {selectedTx.overall_status === "PASS" && (
              <div className="mt-4 border-t border-border/30 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-cyber-emerald" />
                  <span className="text-xs font-mono text-cyber-emerald">WHY NOT FLAGGED</span>
                </div>
                {explainLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="font-mono">Analyzing control checks…</span>
                  </div>
                )}
                {explainData && (
                  <div className="space-y-2">
                    {explainData.reasons_not_flagged?.map((reason: string, i: number) => (
                      <div key={i} className="flex gap-2 text-xs text-foreground/80">
                        <ShieldCheck className="w-3 h-3 text-cyber-emerald mt-0.5 flex-shrink-0" />
                        <span>{reason}</span>
                      </div>
                    ))}
                    {explainData.policy_thresholds_checked && (
                      <div className="mt-3 p-2 rounded bg-muted/30 border border-border/40">
                        <div className="text-[10px] font-mono text-muted-foreground mb-1.5">POLICY THRESHOLDS CHECKED</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono">
                          <span className="text-muted-foreground">Large payment</span>
                          <span className="text-foreground">₹{explainData.policy_thresholds_checked.large_payment_threshold?.toLocaleString()}</span>
                          <span className="text-muted-foreground">Amount tolerance</span>
                          <span className="text-foreground">₹{explainData.policy_thresholds_checked.amount_mismatch_tolerance?.toLocaleString()}</span>
                          <span className="text-muted-foreground">Rapid payment</span>
                          <span className="text-foreground">{explainData.policy_thresholds_checked.rapid_payment_max_days} days</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="glass-panel px-4 py-2 flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-bold", color ?? "text-foreground")}>{value}</span>
    </div>
  );
}
