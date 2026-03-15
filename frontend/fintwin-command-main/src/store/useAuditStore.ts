import { create } from 'zustand';

interface AuditState {
  investigationData: any | null;
  transactionReport: any | null;
  policyData: any | null;
  dataQualityReport: any | null;
  graphData: any | null;
  graphStats: any | null;
  casesData: any | null;
  complianceData: any | null;
  graphBuilt: boolean;
  lastRunAt: string | null;
  backendOnline: boolean;
  highlightedPath: string[] | null;
  highlightedCaseId: string | null;
  // ── Auth ──
  token: string | null;
  userRole: string | null;
  userName: string | null;
  setInvestigationData: (data: any) => void;
  setTransactionReport: (data: any) => void;
  setPolicyData: (data: any) => void;
  setDataQualityReport: (data: any) => void;
  setGraphData: (data: any) => void;
  setGraphStats: (data: any) => void;
  setCasesData: (data: any) => void;
  setComplianceData: (data: any) => void;
  setGraphBuilt: (v: boolean) => void;
  setLastRunAt: (t: string) => void;
  setBackendOnline: (v: boolean) => void;
  setHighlightedPath: (path: string[] | null) => void;
  setHighlightedCaseId: (id: string | null) => void;
  setAuth: (token: string, role: string, userName: string) => void;
  logout: () => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  investigationData: null,
  transactionReport: null,
  policyData: null,
  dataQualityReport: null,
  graphData: null,
  graphStats: null,
  casesData: null,
  complianceData: null,
  graphBuilt: false,
  lastRunAt: null,
  backendOnline: false,
  highlightedPath: null,
  highlightedCaseId: null,
  token: localStorage.getItem("auth_token"),
  userRole: localStorage.getItem("user_role"),
  userName: localStorage.getItem("user_name"),
  setInvestigationData: (data) => set({ investigationData: data }),
  setTransactionReport: (data) => set({ transactionReport: data }),
  setPolicyData: (data) => set({ policyData: data }),
  setDataQualityReport: (data) => set({ dataQualityReport: data }),
  setGraphData: (data) => set({ graphData: data }),
  setGraphStats: (data) => set({ graphStats: data }),
  setCasesData: (data) => set({ casesData: data }),
  setComplianceData: (data) => set({ complianceData: data }),
  setGraphBuilt: (v) => set({ graphBuilt: v }),
  setLastRunAt: (t) => set({ lastRunAt: t }),
  setBackendOnline: (v) => set({ backendOnline: v }),
  setHighlightedPath: (path) => set({ highlightedPath: path }),
  setHighlightedCaseId: (id) => set({ highlightedCaseId: id }),
  setAuth: (token, role, userName) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("user_role", role);
    localStorage.setItem("user_name", userName);
    set({ token, userRole: role, userName });
  },
  logout: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_name");
    set({ token: null, userRole: null, userName: null });
  },
}));
