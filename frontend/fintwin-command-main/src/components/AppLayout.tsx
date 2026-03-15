import { Outlet } from "react-router-dom";
import { SideRail } from "@/components/SideRail";
import { SystemHealthBar } from "@/components/SystemHealthBar";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "react-router-dom";

export default function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <SystemHealthBar />
      <SideRail />
      <div className="ml-16 pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
