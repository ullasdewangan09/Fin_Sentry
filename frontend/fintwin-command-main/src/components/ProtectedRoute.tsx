import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuditStore } from "@/store/useAuditStore";

export function ProtectedRoute() {
  const token = useAuditStore((state) => state.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}