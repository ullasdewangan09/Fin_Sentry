import axios from 'axios';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const API_BASE_URL = (configuredBaseUrl || 'http://localhost:8000').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

// Attach auth token from localStorage automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const loginUser = async (username: string, password: string): Promise<{ access_token: string; role: string }> => {
  const form = new URLSearchParams();
  form.append('username', username);
  form.append('password', password);
  const res = await api.post('/auth/token', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data;
};


export const uploadData = () => api.post('/upload-data');
export const buildGraph = () => api.post('/build-graph');
export const detectRisk = () => api.post('/detect-risk');
export const getInvestigation = () => api.get('/investigation');
export const getRiskFindings = () => api.get('/risk-findings');
export const getDataQualityReport = () => api.get('/data-quality-report');
export const testTransactions = () => api.post('/test-transactions');
export const runAudit = (prompt?: string) => api.post('/run-audit', null, { params: { prompt: prompt || 'Run the full financial audit pipeline.' } });
export const getPolicy = () => api.get('/policy');
export const getGraphImage = () => api.get('/graph/image', { responseType: 'blob' });
export const getGraphStats = () => api.get('/graph/stats');
export const getGraphData = () => api.get('/graph/data');
export const pingBackend = () => api.get('/policy');

// ─── Case management ─────────────────────────────────────────────────────────
export const getCases = () => api.get('/cases');
export const getCase = (caseId: string) => api.get(`/cases/${caseId}`);
export const updateCaseStatus = (caseId: string, status: string, updatedBy = 'user') =>
  api.patch(`/cases/${caseId}/status`, { status, updated_by: updatedBy });
export const updateCaseGovernance = (caseId: string, payload: Record<string, any>) =>
  api.patch(`/cases/${caseId}/governance`, payload);
export const anchorCaseOnWeb3 = (caseId: string, payload?: Record<string, any>) =>
  api.post(`/web3/anchor/case/${caseId}`, payload ?? {});
export const getCaseWeb3Proofs = (caseId: string) => api.get(`/web3/proofs/case/${caseId}`);
export const getWeb3Proof = (anchorId: string) => api.get(`/web3/proofs/${anchorId}`);
export const issueCaseBadge = (caseId: string, payload?: Record<string, any>) =>
  api.post(`/web3/badges/case/${caseId}`, payload ?? {});
export const getCaseBadges = (caseId: string) => api.get(`/web3/badges/case/${caseId}`);
export const getCaseBadge = (badgeId: string) => api.get(`/web3/badges/${badgeId}`);
export const getWeb3VerificationOverview = (limit = 200) =>
  api.get('/web3/verification/overview', { params: { limit } });

// ─── Explainability ──────────────────────────────────────────────────────────
export const explainCase = (caseId: string) => api.get(`/cases/${caseId}/explain`);
export const explainTransaction = (transactionId: string) => api.get(`/explain/transaction/${transactionId}`);

// ─── Evidence bundle ─────────────────────────────────────────────────────────
export const downloadEvidence = (caseId: string) =>
  api.get(`/cases/${caseId}/evidence`, { responseType: 'arraybuffer' });

// ─── Policy live update ───────────────────────────────────────────────────────
export const updatePolicy = (data: Record<string, any>) => api.put('/policy', data);

// ─── Vendor search & subgraph ─────────────────────────────────────────────────
export const searchVendors = (q = '') => api.get('/graph/search', { params: { q } });
export const getVendorSubgraph = (vendorId: string) => api.get(`/graph/vendor/${vendorId}`);

// ─── AI Chat Interface ────────────────────────────────────────────────────────
export const chatCase = (caseId: string, question: string) =>
  api.post(`/cases/${caseId}/chat`, { question });

// ─── Compliance Report ────────────────────────────────────────────────────────
export const getCompliance = () => api.get('/compliance');
export const getSystemicInsights = () => api.get('/systemic-insights');

export default api;
