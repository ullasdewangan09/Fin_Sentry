"use client";

import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface HeroSectionProps {
  title: string;
  subtitle: { regular: string; gradient: string };
  description: string;
  ctaText: string;
  ctaHref: string;
  bottomImage?: { light: string; dark: string };
  gridOptions?: {
    angle?: number;
    opacity?: number;
    cellSize?: number;
    lightLineColor?: string;
    darkLineColor?: string;
  };
}

function RetroGrid({
  angle = 65,
  cellSize = 60,
  opacity = 0.5,
  lightLineColor = "gray",
  darkLineColor = "gray",
}: {
  angle?: number;
  cellSize?: number;
  opacity?: number;
  lightLineColor?: string;
  darkLineColor?: string;
}) {
  const gridStyles = {
    "--grid-angle": `${angle}deg`,
    "--cell-size": `${cellSize}px`,
    "--opacity": opacity,
    "--light-line": lightLineColor,
    "--dark-line": darkLineColor,
  } as React.CSSProperties;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden [perspective:200px]"
      style={gridStyles}
    >
      <div className="absolute inset-0 [transform:rotateX(var(--grid-angle))]">
        <div
          className={cn(
            "animate-grid",
            "[background-repeat:repeat] [background-size:var(--cell-size)_var(--cell-size)]",
            "[height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] [width:600vw]",
            "[background-image:linear-gradient(to_right,var(--dark-line)_1px,transparent_0),linear-gradient(to_bottom,var(--dark-line)_1px,transparent_0)]",
          )}
          style={{ opacity }}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent to-90%" />
    </div>
  );
}

function HeroSection({
  title,
  subtitle,
  description,
  ctaText,
  ctaHref,
  bottomImage,
  gridOptions,
}: HeroSectionProps) {
  const navigate = useNavigate();

  const handleCta = (e: React.MouseEvent) => {
    e.preventDefault();
    const overlay = document.getElementById("transition-overlay");
    if (overlay) {
      overlay.style.opacity = "1";
      setTimeout(() => navigate(ctaHref), 500);
    } else {
      navigate(ctaHref);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden min-h-screen px-4">
      <RetroGrid {...gridOptions} />

      <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-4xl mx-auto pt-20">
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground">
          {title}
        </h1>

        <p className="text-xl sm:text-2xl md:text-3xl font-medium text-foreground/80">
          {subtitle.regular}
          <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            {subtitle.gradient}
          </span>
        </p>

        <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>

        {/* CTA Button with spinning conic gradient */}
        <div className="relative group mt-4">
          <div className="absolute -inset-1 rounded-lg bg-[conic-gradient(from_90deg_at_50%_50%,#00D4FF_0%,#0A0B0F_50%,#00D4FF_100%)] opacity-75 group-hover:opacity-100 blur-sm transition-opacity duration-500 animate-spin [animation-duration:4s]" />
          <button
            onClick={handleCta}
            className="relative font-mono text-sm sm:text-base px-8 py-4 rounded-lg bg-cyber-bg text-primary border border-primary/30 hover:border-primary/60 transition-all duration-300 flex items-center gap-2 hover:shadow-[0_0_30px_hsl(191_100%_50%/0.3)]"
          >
            {ctaText}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {bottomImage && (
        <div className="relative z-10 mt-16 w-full max-w-5xl mx-auto px-4">
          <div className="rounded-xl overflow-hidden border border-border/30 shadow-2xl shadow-primary/10">
            <img
              src={bottomImage.dark}
              alt="Platform preview"
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { HeroSection, RetroGrid };
