import { motion } from "framer-motion";
import { AlertTriangle, BadgeInfo, GitBranch, ShieldCheck, Sparkles, Workflow, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Hero, LandingSceneBackdrop } from "@/components/landing/hero";
import { GraphPreview } from "@/components/landing/graph-preview";
import { SystemTransparency } from "@/components/landing/system-transparency";
import { Architecture } from "@/components/landing/architecture";
import { PlatformInterfacePreview } from "@/components/landing/platform-interface-preview";

const storyPanels = [
  {
    icon: AlertTriangle,
    eyebrow: "Why this matters",
    title: "Transaction anomalies miss structural control bypass",
    body: "Fraud and governance failure often emerge through multi-step pathways across vendors, employees, approvals, invoices, and payments. Each action can look legitimate alone while the full chain silently bypasses internal controls.",
  },
  {
    icon: Sparkles,
    eyebrow: "Innovation",
    title: "Decision-aware pathway discovery instead of isolated alerts",
    body: "The platform builds a financial and decision digital twin so auditors can see how policies, actors, and transactions interacted to produce risk — not just which single transaction looked unusual.",
  },
];

const howItWorks = [
  {
    icon: Workflow,
    step: "01",
    title: "Ingest ERP-style activity",
    body: "Simulated vendors, employees, invoices, approvals, payments, and policy rules are pulled into one governance-ready data layer.",
  },
  {
    icon: GitBranch,
    step: "02",
    title: "Build the decision and financial twin",
    body: "The system maps relationships between entities, decisions, and transactions into a connected graph that mirrors the control environment.",
  },
  {
    icon: ShieldCheck,
    step: "03",
    title: "Explain the bypass pathway",
    body: "Agents reconstruct the risky sequence, identify implicated controls, and generate an investigation summary with evidence and remediation context.",
  },
];

const businessImpact = [
  "Reduce the manual effort auditors spend reconstructing transaction chains across fragmented ERP records.",
  "Surface governance risk earlier by showing how control failures propagate through approvals, payments, and vendor actions.",
  "Give risk teams an explainable, evidence-backed narrative they can use for escalation, remediation, and leadership reporting.",
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <main className="relative overflow-hidden bg-[#0a0a0b]">
      <LandingSceneBackdrop />
      <div className="relative z-10">
        <Hero />

        {/* Story panels + Prototype scope */}
        <section className="mx-auto max-w-[1440px] px-6 pb-6 md:px-10 md:pb-10">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_380px]">
            <div className="grid gap-5 md:grid-cols-2">
              {storyPanels.map((panel, index) => {
                const Icon = panel.icon;
                return (
                  <motion.article
                    key={panel.title}
                    initial={{ opacity: 0.35, y: 28 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.55, delay: index * 0.06 }}
                    className="landing-glass-surface rounded-[2rem] px-6 py-6"
                  >
                    <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-2 text-[#9eb6ff]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[#9eb6ff]">{panel.eyebrow}</p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{panel.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-[#7a8bb5]">{panel.body}</p>
                  </motion.article>
                );
              })}
            </div>

            <motion.aside
              initial={{ opacity: 0.35, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.55, delay: 0.12 }}
              className="landing-glass-surface rounded-[2rem] px-6 py-6"
            >
              <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-2 text-[#8ef0ff]">
                <BadgeInfo className="h-4 w-4" />
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[#8ef0ff]">Prototype scope</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Built for a clean hackathon demonstration</h2>
              <p className="mt-3 text-sm leading-7 text-[#7a8bb5]">
                This prototype uses a simulated enterprise dataset to prove the concept safely: ingest ERP-style records, build
                the control graph, detect a bypass pathway, and generate an explainable investigation summary.
              </p>
              <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold text-white">Why judges should care</p>
                <p className="mt-2 text-sm leading-6 text-[#7a8bb5]">
                  The same architecture can extend to live ERP environments for continuous control monitoring, earlier
                  governance-risk detection, and faster evidence-backed audit response.
                </p>
              </div>
            </motion.aside>
          </div>
        </section>

        {/* How It Works */}
        <section className="mx-auto max-w-[1440px] px-6 pb-8 md:px-10 md:pb-12">
          <div className="landing-glass-surface rounded-[2rem] px-6 py-7 md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <p className="landing-panel-title mb-2">How it works</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  From fragmented ERP records to explainable governance intelligence
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-7 text-[#7a8bb5]">
                The prototype demonstrates a clear three-step flow that turns operational data into a decision-aware
                investigation narrative.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {howItWorks.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.article
                    key={item.step}
                    initial={{ opacity: 0.35, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.5, delay: index * 0.06 }}
                    className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] px-5 py-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold text-white/85">{item.step}</span>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-2 text-[#9eb6ff]">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-[#7a8bb5]">{item.body}</p>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <GraphPreview />
        <SystemTransparency />
        <Architecture />
        <PlatformInterfacePreview />

        {/* Business Impact */}
        <section className="mx-auto max-w-[1440px] px-6 pb-8 md:px-10 md:pb-10">
          <div className="landing-glass-surface rounded-[2rem] px-6 py-7 md:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <p className="landing-panel-title mb-2">Business impact</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Why enterprises need pathway-level audit intelligence
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-7 text-[#7a8bb5]">
                Hidden control bypass chains increase financial leakage, compliance exposure, and investigation effort. The
                platform is designed to reduce those blind spots.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {businessImpact.map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0.35, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.45, delay: index * 0.05 }}
                  className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] px-5 py-5 text-sm leading-7 text-[#7a8bb5]"
                >
                  {item}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <footer className="mx-auto max-w-[1440px] px-6 pb-16 md:px-10 text-center">
          <p className="text-[#7a8bb5] text-sm mb-1">Built for INNOVAT3</p>
          <p className="text-[#7a8bb5]/60 text-xs mb-6">Decision & Financial Digital Twin Platform</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#6c5ce7]/25 transition-all duration-200 hover:shadow-xl hover:brightness-110 active:scale-[0.96]"
          >
            Enter Platform <ArrowRight className="w-4 h-4" />
          </button>
        </footer>
      </div>
    </main>
  );
}
