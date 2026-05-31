"use client";

// Aurora background — drifting blurred light ribbons behind everything.
// Replaces the flat #030712. Pure CSS/GPU (no canvas): three layered
// gradient ribbons translate + rotate at different speeds; a heavy blur
// fuses them into northern-lights bands. `hueShift` lets the page nudge
// the whole field toward the robot's current mood color.
import { cn } from "@/app/lib/utils";

export function AuroraBackground({
  hueShift = 0,
  className,
}: {
  hueShift?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none fixed inset-0 overflow-hidden", className)}
      style={{ zIndex: 0, background: "#030712" }}
    >
      {/* Deep base wash so the floor is never pure black */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, rgba(76,29,149,0.45) 0%, rgba(30,27,75,0.25) 35%, transparent 70%)",
        }}
      />

      {/* The aurora ribbons — blurred + hue-rotated as one group */}
      <div
        className="absolute inset-[-25%]"
        style={{
          filter: `blur(64px) saturate(150%) hue-rotate(${hueShift}deg)`,
          transition: "filter 1.2s ease",
        }}
      >
        <div className="aurora-ribbon aurora-ribbon--a" />
        <div className="aurora-ribbon aurora-ribbon--b" />
        <div className="aurora-ribbon aurora-ribbon--c" />
      </div>

      {/* Fine grain so gradients never band */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
