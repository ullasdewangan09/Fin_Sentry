import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";

// Deterministic seeded pseudo-random — keeps node positions stable across renders
function sv(s: number) {
  const raw = Math.sin(s * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

// 52 nodes spread in a hemisphere-like pattern (SVG viewBox 0 0 100 100)
const NODES = Array.from({ length: 52 }, (_, i) => {
  const angle = sv(i * 3 + 1) * Math.PI * 2;
  const r = 6 + sv(i * 3 + 2) * 32;
  return {
    cx: 50 + Math.cos(angle) * r * 0.78,
    cy: 50 + Math.sin(angle) * r * 0.62,
    r: 0.55 + sv(i * 3 + 3) * 1.1,
    risk: i % 17 === 0 || i % 29 === 0,
  };
});

// Edges between node pairs
const EDGES: Array<[number, number]> = [];
for (let i = 0; i < 52; i++) {
  EDGES.push([i, (i + 1) % 52]);
  EDGES.push([i, (i + 7) % 52]);
  if (i % 5 === 0) EDGES.push([i, (i + 19) % 52]);
}


export function LandingSceneBackdrop() {
  const { scrollY } = useScroll();
  const canvasY = useTransform(scrollY, [0, 140, 1300, 2500], [0, -12, -62, -92]);
  const canvasScale = useTransform(scrollY, [0, 2500], [1, 1.03]);
  const canvasOpacity = useTransform(scrollY, [0, 95, 1300, 2500], [0.76, 0.74, 0.67, 0.52]);

  return (
    <>
      {/* Fade-in loading splash */}
      <AnimatePresence>
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, delay: 0.5 }}
          className="pointer-events-none fixed inset-0 z-[4]"
        >
          <div className="absolute inset-0 bg-[#0a0a0b]" />
        </motion.div>
      </AnimatePresence>

      <motion.div
        className="pointer-events-none fixed inset-0 z-[2]"
        style={{ y: canvasY, scale: canvasScale, opacity: canvasOpacity }}
      >
        {/* Base dark background */}
        <div className="absolute inset-0 bg-[#0a0a0b]" />

        {/* Layered radial glows — simulates sphere light */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_52%_46%_at_50%_44%,rgba(79,107,255,0.22),transparent_68%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_30%_28%_at_50%_44%,rgba(123,224,255,0.10),transparent_58%)]" />

        {/* SVG node-graph visualization */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7be0ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#7be0ff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="riskGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff4d4f" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ff4d4f" stopOpacity="0" />
            </radialGradient>
            <filter id="blur-sm" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.4" />
            </filter>
          </defs>

          {/* Connector lines */}
          {EDGES.map(([a, b], i) => (
            <line
              key={i}
              x1={NODES[a].cx}
              y1={NODES[a].cy}
              x2={NODES[b].cx}
              y2={NODES[b].cy}
              stroke="#7be0ff"
              strokeOpacity={0.09}
              strokeWidth={0.15}
            />
          ))}

          {/* Nodes */}
          {NODES.map((n, i) => (
            <g key={i}>
              <circle
                cx={n.cx}
                cy={n.cy}
                r={n.r * 2.8}
                fill={n.risk ? "url(#riskGlow)" : "url(#nodeGlow)"}
                opacity={0.2}
                filter="url(#blur-sm)"
              />
              <circle
                cx={n.cx}
                cy={n.cy}
                r={n.r}
                fill={n.risk ? "#ff4d4f" : "#b2c1ff"}
                opacity={0.85}
              />
            </g>
          ))}
        </svg>

        {/* Pulsing glass sphere rings */}
        <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="h-[320px] w-[320px] rounded-full border border-[#7be0ff]/14 bg-[radial-gradient(circle_at_center,rgba(79,107,255,0.06),transparent_62%)]"
            animate={{ scale: [1, 1.025, 1], opacity: [0.55, 0.75, 0.55] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="h-[460px] w-[460px] rounded-full border border-[#4f6bff]/10"
            animate={{ scale: [1, 1.015, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          />
        </div>
      </motion.div>

      {/* Soft overlay vignette */}
      <div className="pointer-events-none fixed inset-0 z-[3] bg-[radial-gradient(circle_at_50%_34%,rgba(79,107,255,0.15),transparent_54%),linear-gradient(180deg,rgba(10,10,11,0.06),rgba(10,10,11,0.16))]" />
    </>
  );
}

export function Hero() {
  const navigate = useNavigate();
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef(pointer);
  const lensShiftX = (pointer.x - 0.5) * 26;
  const lensShiftY = (pointer.y - 0.5) * 18;

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      pendingPointerRef.current = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(() => {
          setPointer(pendingPointerRef.current);
          rafRef.current = null;
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const openPlatform = () => {
    const section = document.getElementById("platform-engines");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="hero-section" className="relative min-h-screen overflow-hidden">
      {/* Grid overlay */}
      <div className="landing-grid-overlay" />
      {/* Noise texture */}
      <div className="landing-noise-overlay" />
      {/* Vignette */}
      <div className="landing-hero-vignette" />

      {/* Floating particles following cursor */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <motion.div
            key={index}
            className="absolute h-1.5 w-1.5 rounded-full bg-[#55efc4]/65 blur-[0.2px]"
            animate={{
              x: `${pointer.x * (84 - index * 5) + 8}%`,
              y: `${pointer.y * (72 - index * 4) + 8}%`,
              opacity: [0.22, 0.75, 0.22],
            }}
            transition={{
              x: { duration: 0.55 + index * 0.06, ease: [0.16, 1, 0.3, 1] },
              y: { duration: 0.55 + index * 0.06, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 2 + index * 0.2, repeat: Infinity },
            }}
          />
        ))}
      </div>

      {/* Rotating lens rings */}
      <div className="pointer-events-none absolute inset-0 z-[22] hidden items-center justify-center md:flex">
        <motion.div
          className="relative h-[620px] w-[620px]"
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
          style={{ x: lensShiftX, y: lensShiftY }}
        >
          <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#6c5ce7]/20 bg-[radial-gradient(circle_at_center,rgba(123,224,255,0.12),rgba(10,10,11,0.02)_48%,transparent_72%)]" />
          <motion.div
            className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#55efc4]/25"
            animate={{ rotate: [360, 0], scale: [1, 1.02, 1] }}
            transition={{ rotate: { duration: 54, repeat: Infinity, ease: "linear" }, scale: { duration: 6, repeat: Infinity } }}
          />
          <div className="absolute left-1/2 top-1/2 h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-white/5 backdrop-blur-2xl" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#55efc4] shadow-[0_0_18px_rgba(123,224,255,0.75)]" />
        </motion.div>
      </div>

      {/* Top navigation bar */}
      <header className="absolute inset-x-0 top-0 z-40 mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-6 md:px-10">
        <p className="landing-glass-surface rounded-full px-4 py-2 text-[11px] tracking-[0.22em] text-[#7a8bb5]">
          DECISION & FINANCIAL DIGITAL TWIN
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-full px-5 py-2.5 text-xs font-semibold tracking-wide bg-white/90 text-[#1e2235] shadow-sm border border-white/20 backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md active:scale-[0.96] active:shadow-sm"
          >
            Open Dashboard
          </button>
        </div>
      </header>

      {/* Hero content */}
      <div className="relative z-30 mx-auto flex min-h-screen w-full max-w-[1160px] items-center justify-center px-6 pt-24 md:px-10">
        <div className="mx-auto max-w-5xl text-center landing-depth-fade-in">
          <p className="mb-6 text-xs uppercase tracking-[0.24em] text-[#7a8bb5]">Enterprise Governance Intelligence</p>
          <h1 className="text-[2.7rem] font-medium leading-[0.94] text-white md:text-7xl lg:text-[70px]">
            Reveal Hidden Governance Risks Inside Enterprise Decisions
          </h1>
          <p className="mx-auto mt-7 max-w-3xl text-base leading-relaxed text-[#7a8bb5] md:text-xl">
            Decision & Financial Digital Twin Platform for structural audit intelligence across enterprise financial systems.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={openPlatform}
              className="rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] px-7 py-3.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-[#6c5ce7]/25 transition-all duration-200 hover:shadow-xl hover:shadow-[#6c5ce7]/35 hover:brightness-110 active:scale-[0.96]"
            >
              <span className="inline-flex items-center gap-2">
                Explore Platform
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="rounded-full border border-white/15 bg-white/8 px-7 py-3.5 text-sm font-bold tracking-wide text-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-white/15 hover:text-white active:scale-[0.96]"
            >
              Open Dashboard
            </button>
          </div>
          <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-[#7a8bb5]">
            <ArrowDown className="h-3.5 w-3.5" />
            Scroll to reveal platform sections
          </div>
        </div>
      </div>
    </section>
  );
}
