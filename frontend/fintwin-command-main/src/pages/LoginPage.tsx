import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { loginUser } from "@/lib/api";
import { useAuditStore } from "@/store/useAuditStore";

function getLoginError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Invalid credentials provided.";
}

function FlowingPattern() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);

    interface Pill {
      x: number;
      y: number;
      width: number;
      length: number;
      speed: number;
      isWhite: boolean;
    }

    let pills: Pill[] = [];
    const colWidth = 32;

    const initPills = () => {
      pills = [];
      const columns = Math.ceil(w / colWidth);
      for (let c = 0; c < columns; c++) {
        const numPills = 4 + Math.random() * 6;
        for (let i = 0; i < numPills; i++) {
          pills.push({
            x: c * colWidth + colWidth / 2,
            y: Math.random() * h * 2 - h,
            width: colWidth * 0.65,
            length: 40 + Math.random() * 160,
            speed: 1.5 + Math.random() * 2.5,
            isWhite: Math.random() > 0.45,
          });
        }
      }
    };
    initPills();

    let animationId: number;
    const render = () => {
      ctx.fillStyle = "#0f1123";
      ctx.fillRect(0, 0, w, h);

      pills.forEach((p) => {
        p.y += p.speed;
        if (p.y > h + 150) p.y = -p.length - Math.random() * 100;

        ctx.beginPath();
        ctx.lineCap = "round";
        ctx.lineWidth = p.width;
        ctx.strokeStyle = p.isWhite ? "#a29bfe" : "#6c5ce7";
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + p.length);
        ctx.stroke();
      });

      animationId = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      initPills();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-95" />;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuditStore((s) => s.setAuth);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) navigate("/dashboard", { replace: true });
  }, [navigate]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const response = await loginUser(username, password);
      setAuth(response.access_token, response.role ?? "auditor", username);
      navigate("/dashboard");
    } catch (loginError: unknown) {
      setError(getLoginError(loginError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white text-slate-900 font-sans">
      {/* -- Left Side: Login Form -- */}
      <div className="flex w-full flex-col justify-center px-8 lg:w-[45%] xl:w-[40%] 2xl:w-[35%] lg:px-16 xl:px-24">
        {/* Logo */}
        <div className="mb-8 text-[#0a0a0a]">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 4L4 12V28L20 36L36 28V12L20 4ZM20 18L10 13L20 8L30 13L20 18Z" />
            <path d="M20 32L10 27V17L20 22L30 17V27L20 32Z" />
          </svg>
        </div>

        {/* Back Button */}
        <button
          onClick={() => navigate("/")}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0a0a0a] transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        {/* Headings */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900">Welcome back</h1>
          <p className="mb-8 text-xs font-semibold text-slate-400">
            Sign in to continue to the decision intelligence workspace.
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          onSubmit={handleLogin}
          className="space-y-4"
        >
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-50 p-3 text-[13px] text-red-600 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">Username *</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#6c5ce7] focus:ring-4 focus:ring-[#6c5ce7]/10"
              placeholder="Enter your username"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">Password *</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-10 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-[#6c5ce7] focus:ring-4 focus:ring-[#6c5ce7]/10"
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#6c5ce7] transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-[#6c5ce7] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#6c5ce7]/25 transition-all hover:bg-[#5a4acf] hover:shadow-xl hover:shadow-[#6c5ce7]/40 active:scale-[0.98] disabled:opacity-70 mt-4"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-500">
            <p className="font-semibold text-slate-600 mb-1">Demo credentials</p>
            <p><span className="font-mono">admin</span> / <span className="font-mono">Admin@12345</span> - Full access</p>
            <p><span className="font-mono">auditor</span> / <span className="font-mono">Audit@12345</span> - Read-only auditor</p>
          </div>
        </motion.form>
      </div>

      {/* -- Right Side: Animated background -- */}
      <div className="relative hidden flex-1 overflow-hidden lg:flex">
        <FlowingPattern />
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center pointer-events-none">
          <div className="relative z-10 max-w-md">
            <div className="mb-6 inline-flex rounded-2xl border border-white/10 bg-white/5 p-4">
              <svg width="32" height="32" viewBox="0 0 40 40" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4L4 12V28L20 36L36 28V12L20 4ZM20 18L10 13L20 8L30 13L20 18Z" />
                <path d="M20 32L10 27V17L20 22L30 17V27L20 32Z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Decision & Financial Digital Twin</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Enterprise governance intelligence that reveals hidden control bypass pathways before auditors open a spreadsheet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
