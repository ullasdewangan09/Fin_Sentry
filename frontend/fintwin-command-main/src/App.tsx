import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import GraphPage from "./pages/GraphPage";
import RiskIntelPage from "./pages/RiskIntelPage";
import TransactionsPage from "./pages/TransactionsPage";
import PolicyPage from "./pages/PolicyPage";
import CasesPage from "./pages/CasesPage";
import CompliancePage from "./pages/CompliancePage";
import Web3VerificationPage from "./pages/Web3VerificationPage";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} themes={["dark", "light"]}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/graph" element={<GraphPage />} />
              <Route path="/risk" element={<RiskIntelPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/policy" element={<PolicyPage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/trust-ledger" element={<Web3VerificationPage />} />
              <Route path="/web3-verification" element={<Web3VerificationPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
