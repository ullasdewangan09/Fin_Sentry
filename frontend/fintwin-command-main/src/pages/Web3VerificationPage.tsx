import { useEffect, useState } from "react";
import { RefreshCw, Link2, BadgeCheck, Copy, ShieldCheck } from "lucide-react";
import { getWeb3VerificationOverview } from "@/lib/api";
import { ScanLoader } from "@/components/ScanLoader";

const STATUS_CLASS: Record<string, string> = {
  submitted: "bg-cyber-emerald/20 text-cyber-emerald border border-cyber-emerald/40",
  simulated: "bg-cyan-500/10 text-cyan-400 border border-cyan-400/30",
  queued: "bg-cyber-amber/20 text-cyber-amber border border-cyber-amber/40",
  pending: "bg-muted text-muted-foreground border border-border/40",
};

const shortHash = (value?: string) => {
  if (!value) return "N/A";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
};

const fmtDate = (value?: string) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

export default function Web3VerificationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await getWeb3VerificationOverview(200);
      setData(resp.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to load verification overview.";
      setError(String(detail));
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetch();
  }, []);

  const copy = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((p) => (p === key ? null : p)), 1000);
    } catch (_) {
      // ignore clipboard errors
    }
  };

  if (loading) return <ScanLoader text="LOADING TRUST LEDGER..." />;

  const summary = data?.summary ?? {};
  const proofs: any[] = data?.recent_proofs ?? [];
  const badges: any[] = data?.recent_badges ?? [];
  const submittedProofs = Number(summary?.proof_status?.submitted ?? 0);
  const submittedBadges = Number(summary?.badge_status?.submitted ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trust Ledger</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Unified view for on-chain proofs and NFT compliance badges.
          </p>
        </div>
        <button
          onClick={() => void fetch()}
          className="inline-flex items-center gap-2 text-xs font-mono px-3 py-2 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-sm font-mono text-cyber-crimson border border-cyber-crimson/40 bg-cyber-crimson/10 rounded p-3">
          {error}
        </div>
      )}

      <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs font-mono text-muted-foreground leading-relaxed">
          `submitted` means real chain transaction confirmed. `simulated` means local proof/badge created without chain transaction.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Proofs" value={String(summary?.proof_total ?? 0)} />
        <StatCard label="Submitted Proofs" value={String(submittedProofs)} accent="text-cyber-emerald" />
        <StatCard label="Total Badges" value={String(summary?.badge_total ?? 0)} />
        <StatCard label="Submitted Badges" value={String(submittedBadges)} accent="text-cyber-emerald" />
        <StatCard label="Cases Covered" value={String(summary?.unique_cases_with_proofs ?? 0)} accent="text-cyan-400" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <StatusPanel title="Proof Status" stats={summary?.proof_status ?? {}} />
        <StatusPanel title="Badge Status" stats={summary?.badge_status ?? {}} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400">
            <Link2 className="w-4 h-4" />
            <h2 className="text-sm font-mono">Recent Anchors</h2>
          </div>
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {proofs.length === 0 && (
              <div className="text-xs font-mono text-muted-foreground border border-border/30 rounded p-3">
                No anchors yet.
              </div>
            )}
            {proofs.map((p) => (
              <div key={p.anchor_id} className="rounded border border-border/40 p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${STATUS_CLASS[p.status] ?? STATUS_CLASS.pending}`}>
                    {p.status ?? "pending"}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">{fmtDate(p.created_at)}</span>
                </div>
                <KeyValue label="Case" value={p.case_id} />
                <KeyValueWithCopy
                  label="Anchor"
                  value={shortHash(p.anchor_id)}
                  onCopy={() => copy(String(p.anchor_id || ""), `${p.anchor_id}-anchor`)}
                  copied={copied === `${p.anchor_id}-anchor`}
                />
                <KeyValueWithCopy
                  label="Tx"
                  value={p.tx_hash ? shortHash(p.tx_hash) : "not submitted"}
                  onCopy={p.tx_hash ? () => copy(String(p.tx_hash || ""), `${p.anchor_id}-tx`) : undefined}
                  copied={copied === `${p.anchor_id}-tx`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyber-amber">
            <BadgeCheck className="w-4 h-4" />
            <h2 className="text-sm font-mono">Recent NFT Badges</h2>
          </div>
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {badges.length === 0 && (
              <div className="text-xs font-mono text-muted-foreground border border-border/30 rounded p-3">
                No badges yet.
              </div>
            )}
            {badges.map((b) => (
              <div key={b.badge_id} className="rounded border border-border/40 p-3 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${STATUS_CLASS[b.status] ?? STATUS_CLASS.pending}`}>
                    {b.status ?? "pending"}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">{fmtDate(b.created_at)}</span>
                </div>
                <KeyValue label="Case" value={b.case_id} />
                <KeyValue label="Token" value={String(b.token_id ?? "N/A")} />
                <KeyValueWithCopy
                  label="Badge"
                  value={b.badge_id ?? "N/A"}
                  onCopy={b.badge_id ? () => copy(String(b.badge_id), `${b.badge_id}-id`) : undefined}
                  copied={copied === `${b.badge_id}-id`}
                />
                <KeyValueWithCopy
                  label="Tx"
                  value={b.tx_hash ? shortHash(b.tx_hash) : "not submitted"}
                  onCopy={b.tx_hash ? () => copy(String(b.tx_hash || ""), `${b.badge_id}-tx`) : undefined}
                  copied={copied === `${b.badge_id}-tx`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="glass-panel p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-2xl font-mono font-bold ${accent ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}

function StatusPanel({ title, stats }: { title: string; stats: Record<string, number> }) {
  const entries = Object.entries(stats || {});
  return (
    <div className="glass-panel p-4 space-y-2">
      <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {entries.map(([k, v]) => (
          <span key={k} className={`text-xs font-mono px-2 py-1 rounded ${STATUS_CLASS[k] ?? STATUS_CLASS.pending}`}>
            {k}: {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 text-xs font-mono">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground break-all">{value}</span>
    </div>
  );
}

function KeyValueWithCopy({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 text-xs font-mono">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-foreground break-all flex items-center gap-2">
        <span>{value}</span>
        {onCopy && (
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Copy className="w-3 h-3" />
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
