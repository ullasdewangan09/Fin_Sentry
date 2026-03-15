import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const PIPELINE = [
  "Enterprise Data",
  "Digital Twin Graph",
  "Decision Intelligence",
  "Control Pathway Detection",
  "Investigation Engine",
];

export function Architecture() {
  return (
    <section id="architecture-section" className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-20">
      <div className="mb-16 max-w-3xl">
        <p className="landing-panel-title mb-4">Architecture</p>
        <h2 className="text-4xl leading-tight text-white md:text-6xl">
          From enterprise data to investigation-ready risk intelligence
        </h2>
      </div>

      <div className="landing-glass-surface rounded-[2.2rem] p-6 md:p-10">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
          {PIPELINE.map((step, index) => (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-90px" }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: index * 0.08 }}
              className="relative"
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5">
                <p className="landing-panel-title mb-2">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="text-base text-white md:text-lg">{step}</h3>
              </div>

              {index < PIPELINE.length - 1 && (
                <div className="hidden xl:flex items-center justify-center">
                  <motion.div
                    className="absolute right-[-14px] top-1/2 -translate-y-1/2"
                    animate={{ x: [0, 4, 0], opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 2.4, repeat: Infinity, delay: index * 0.25 }}
                  >
                    <ArrowRight className="h-4 w-4 text-[#a29bfe]" />
                  </motion.div>
                </div>
              )}

              {index < PIPELINE.length - 1 && (
                <motion.div
                  className="absolute bottom-[-7px] left-1/2 h-4 w-px -translate-x-1/2 bg-gradient-to-b from-[#a29bfe]/55 to-transparent xl:hidden"
                  animate={{ opacity: [0.25, 0.85, 0.25] }}
                  transition={{ duration: 1.7, repeat: Infinity, delay: index * 0.2 }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
