import { useEffect, useState } from "react";
import { useAuditStore } from "@/store/useAuditStore";
import { getPolicy, updatePolicy } from "@/lib/api";
import { ScanLoader } from "@/components/ScanLoader";
import { formatIndianCurrency } from "@/lib/formatting";
import { RefreshCw, Calendar, Timer, Edit2, Save, X, CheckCircle2, ArrowRight, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function PolicyPage() {
  const { policyData, setPolicyData } = useAuditStore();
  const [loading, setLoading] = useState(!policyData);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});

  const load = () => {
    setLoading(true);
    getPolicy().then(r => { setPolicyData(r.data); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => {
    if (policyData) { setLoading(false); return; }
    load();
  }, []);

  const startEdit = () => {
    if (!policyData) return;
    setDraft({
      invoice_approval_threshold: policyData.invoice_approval_threshold,
      large_payment_threshold: policyData.large_payment_threshold,
      invoice_splitting_window_days: policyData.invoice_splitting_window_days,
      invoice_splitting_min_count: policyData.invoice_splitting_min_count,
      rapid_payment_max_days: policyData.rapid_payment_max_days,
      dormancy_threshold_days: policyData.dormancy_threshold_days,
      amount_mismatch_tolerance: policyData.amount_mismatch_tolerance,
    });
    setEditMode(true);
    setSaved(false);
  };

  const cancelEdit = () => { setEditMode(false); setDraft({}); };

  const savePolicy = async () => {
    setSaving(true);
    try {
      const res = await updatePolicy(draft);
      setPolicyData(res.data.policy);
      setEditMode(false);
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (_) { /* ignore */ }
    setSaving(false);
  };

  if (loading) return <ScanLoader text="LOADING POLICY..." />;
  if (!policyData) return <div className="p-6 text-muted-foreground">Failed to load policy data.</div>;

  const p = policyData;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Policy Configuration Console</h1>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-cyber-emerald font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved & live
            </span>
          )}
          {!editMode ? (
            <>
              <button onClick={load} className="text-muted-foreground hover:text-primary transition-colors p-1.5" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Policy
              </button>
            </>
          ) : (
            <>
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={savePolicy}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded bg-primary text-background hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save & Apply"}
              </button>
            </>
          )}
        </div>
      </div>

      {editMode && (
        <div className="flex items-center gap-2 p-3 rounded bg-primary/10 border border-primary/20">
          <Edit2 className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground/80">
            Edit mode — changes apply <strong>immediately</strong> to the live system without restarting the server.{" "}
            <Link to="/risk" className="inline-flex items-center gap-0.5 text-primary hover:underline font-semibold">
              Re-run Risk Analysis <ArrowRight className="w-3 h-3" />
            </Link>{" "}
            to see updated findings.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Thresholds */}
        <div className="space-y-4">
          <h3 className="font-mono text-sm text-muted-foreground">THRESHOLDS</h3>

          {editMode ? (
            <div className="space-y-3">
              <EditField
                label="Invoice Approval Threshold (₹)"
                value={draft.invoice_approval_threshold}
                type="number"
                onChange={v => setDraft(d => ({ ...d, invoice_approval_threshold: parseFloat(v) }))}
              />
              <EditField
                label="Large Payment Threshold (₹)"
                value={draft.large_payment_threshold}
                type="number"
                onChange={v => setDraft(d => ({ ...d, large_payment_threshold: parseFloat(v) }))}
              />
              <EditField
                label="Invoice Splitting Window (days)"
                value={draft.invoice_splitting_window_days}
                type="number"
                onChange={v => setDraft(d => ({ ...d, invoice_splitting_window_days: parseInt(v) }))}
              />
              <EditField
                label="Min Invoices for Splitting Flag"
                value={draft.invoice_splitting_min_count}
                type="number"
                onChange={v => setDraft(d => ({ ...d, invoice_splitting_min_count: parseInt(v) }))}
              />
              <EditField
                label="Rapid Payment Max Days"
                value={draft.rapid_payment_max_days}
                type="number"
                onChange={v => setDraft(d => ({ ...d, rapid_payment_max_days: parseInt(v) }))}
              />
              <EditField
                label="Dormancy Threshold (days)"
                value={draft.dormancy_threshold_days}
                type="number"
                onChange={v => setDraft(d => ({ ...d, dormancy_threshold_days: parseInt(v) }))}
              />
              <EditField
                label="Amount Mismatch Tolerance (₹)"
                value={draft.amount_mismatch_tolerance}
                type="number"
                onChange={v => setDraft(d => ({ ...d, amount_mismatch_tolerance: parseFloat(v) }))}
              />
            </div>
          ) : (
            <>
              <ThresholdCard label="Invoice Approval Threshold" value={formatIndianCurrency(p.invoice_approval_threshold || 0)} />
              <ThresholdCard label="Large Payment Threshold" value={formatIndianCurrency(p.large_payment_threshold || 0)} />
              <ThresholdCard label="Invoice Splitting Window" value={`${p.invoice_splitting_window_days || 0} days`} icon={Calendar} />
              <ThresholdCard label="Min Invoices for Splitting Flag" value={p.invoice_splitting_min_count || 0} />
              <ThresholdCard label="Rapid Payment Max Days" value={`${p.rapid_payment_max_days || 0} days`} icon={Timer} />
              <ThresholdCard label="Dormancy Threshold" value={`${p.dormancy_threshold_days || 0} days`} />
              <ThresholdCard label="Amount Mismatch Tolerance" value={`₹${p.amount_mismatch_tolerance || 0}`} />
            </>
          )}
        </div>

        {/* Senior Approvers */}
        <div>
          <h3 className="font-mono text-sm text-muted-foreground mb-4">DESIGNATED SENIOR APPROVERS</h3>
          <div className="space-y-3">
            {(p.senior_approvers || []).map((user: string) => (
              <div key={user} className="glass-panel p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-cyber-amber/20 border border-cyber-amber/40 flex items-center justify-center font-mono text-sm font-bold text-cyber-amber">
                  {user.replace("user_", "").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <span className="font-mono text-foreground">{user}</span>
                  <span className="ml-2 px-2 py-0.5 rounded text-xs font-mono bg-cyber-amber/20 text-cyber-amber">Senior Approver</span>
                </div>
              </div>
            ))}
          </div>

          {p.source && (
            <div className="mt-4 glass-panel px-3 py-2">
              <span className="text-xs text-muted-foreground">Policy source: </span>
              <span className="text-xs font-mono text-primary">{p.source}</span>
            </div>
          )}

          {/* Quick impact preview in edit mode */}
          {editMode && (
            <div className="mt-4 glass-panel p-4 space-y-2">
              <h4 className="text-xs font-mono text-muted-foreground mb-2">PREVIEW — CHANGED VALUES</h4>
              {Object.entries(draft).map(([k, v]) => {
                const orig = (p as any)[k];
                const changed = v !== orig;
                return changed ? (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="font-mono">
                      <span className="text-muted-foreground line-through mr-2">{String(orig)}</span>
                      <span className="text-cyber-amber">{String(v)}</span>
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="font-mono text-sm text-muted-foreground">CONTROL CATALOG</h3>
          </div>
          <div className="space-y-3">
            {(p.control_catalog || []).map((control: any) => (
              <div key={control.control_id} className="rounded border border-border/70 bg-background/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm text-primary">{control.control_id}</span>
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {control.governance_area}
                  </span>
                </div>
                <div className="text-sm text-foreground">{control.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{control.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="font-mono text-sm text-muted-foreground">ROLE ASSIGNMENTS</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(p.role_assignments || {}).map(([role, users]) => (
              <div key={role} className="rounded border border-border/70 bg-background/30 p-3">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-2">
                  {role.replace(/_/g, " ")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(users as string[]).map(user => (
                    <span key={user} className="px-2 py-1 rounded border border-primary/20 bg-primary/10 text-xs font-mono text-primary">
                      {user}
                    </span>
                  ))}
                  {!(users as string[]).length && (
                    <span className="text-xs font-mono text-muted-foreground">No assignment configured</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!editMode && (
        <div className="flex items-center gap-2 p-3 rounded bg-primary/10 border border-primary/20">
          <Edit2 className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground/80">
            Click <strong>Edit Policy</strong> to change thresholds live — no server restart required.
          </p>
        </div>
      )}
    </div>
  );
}

function ThresholdCard({ label, value, icon: Icon }: { label: string; value: string | number; icon?: any }) {
  return (
    <div className="glass-panel p-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <span className="text-sm text-foreground/80">{label}</span>
      </div>
      <span className="font-mono text-sm text-primary font-semibold">{value}</span>
    </div>
  );
}

function EditField({ label, value, type, onChange }: { label: string; value: any; type: string; onChange: (v: string) => void }) {
  return (
    <div className="glass-panel p-3">
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent font-mono text-sm text-primary focus:outline-none border-b border-primary/30 focus:border-primary pb-0.5"
      />
    </div>
  );
}

