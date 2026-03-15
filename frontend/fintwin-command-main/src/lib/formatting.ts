export function formatIndianCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (abs >= 1e7) {
    const cr = abs / 1e7;
    const formatted = formatIndianNumber(abs);
    return `${sign}₹${formatted} (₹${cr.toFixed(2)} Cr)`;
  }
  if (abs >= 1e5) {
    const lac = abs / 1e5;
    const formatted = formatIndianNumber(abs);
    return `${sign}₹${formatted} (₹${lac.toFixed(2)} Lac)`;
  }
  return `${sign}₹${formatIndianNumber(abs)}`;
}

function formatIndianNumber(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${formatted},${last3}`;
}

export function getRiskColor(riskType: string): string {
  const map: Record<string, string> = {
    segregation_of_duties: 'bg-cyber-crimson',
    invoice_splitting: 'bg-cyber-amber',
    rapid_vendor_to_payment: 'bg-cyber-orange',
    large_payment_no_senior_approver: 'bg-cyber-amber',
    missing_approval: 'bg-cyber-crimson',
    duplicate_invoice: 'bg-cyber-orange',
    amount_mismatch: 'bg-cyber-purple',
    dormant_vendor_reactivation: 'bg-cyber-teal',
  };
  return map[riskType] || 'bg-muted';
}

export function getRiskTextColor(riskType: string): string {
  const map: Record<string, string> = {
    segregation_of_duties: 'text-cyber-crimson',
    invoice_splitting: 'text-cyber-amber',
    rapid_vendor_to_payment: 'text-cyber-orange',
    large_payment_no_senior_approver: 'text-cyber-amber',
    missing_approval: 'text-cyber-crimson',
    duplicate_invoice: 'text-cyber-orange',
    amount_mismatch: 'text-cyber-purple',
    dormant_vendor_reactivation: 'text-cyber-teal',
  };
  return map[riskType] || 'text-muted-foreground';
}
