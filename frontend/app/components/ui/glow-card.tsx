"use client";

// Source: easemize/spotlight-card — https://21st.dev/community/components/easemize/spotlight-card/default
import React, { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/app/lib/utils";

type GlowColor = "blue" | "purple" | "green" | "red" | "orange";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: GlowColor;
  customSize?: boolean;
}

const glowColorMap: Record<GlowColor, { base: number; spread: number }> = {
  blue:   { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green:  { base: 120, spread: 200 },
  red:    { base: 0,   spread: 200 },
  orange: { base: 30,  spread: 200 },
};

// Safe: this is a module-scope string literal with no runtime interpolation
// and no user-controlled data. dangerouslySetInnerHTML is the only way to
// inject ::before/::after pseudo-element rules that reference CSS custom
// properties set inline on the card element. No sanitization needed.
const beforeAfterCSS = `
  [data-glow]::before,
  [data-glow]::after {
    pointer-events: none;
    content: "";
    position: absolute;
    inset: calc(var(--border-size) * -1);
    border: var(--border-size) solid transparent;
    border-radius: calc(var(--radius) * 1px);
    background-attachment: fixed;
    background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
    background-repeat: no-repeat;
    background-position: 50% 50%;
    mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
    mask-clip: padding-box, border-box;
    mask-composite: intersect;
  }
  [data-glow]::before {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.75) calc(var(--spotlight-size) * 0.75) at
      calc(var(--x, 0) * 1px) calc(var(--y, 0) * 1px),
      hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 50) * 1%) / var(--border-spot-opacity, 1)),
      transparent 100%
    );
    filter: brightness(2);
  }
  [data-glow]::after {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.5) calc(var(--spotlight-size) * 0.5) at
      calc(var(--x, 0) * 1px) calc(var(--y, 0) * 1px),
      hsl(0 100% 100% / var(--border-light-opacity, 1)),
      transparent 100%
    );
  }
  [data-glow] [data-glow] {
    position: absolute;
    inset: 0;
    will-change: filter;
    opacity: var(--outer, 1);
    border-radius: calc(var(--radius) * 1px);
    border-width: calc(var(--border-size) * 20);
    filter: blur(calc(var(--border-size) * 10));
    background: none;
    pointer-events: none;
    border: none;
  }
  [data-glow] > [data-glow]::before {
    inset: -10px;
    border-width: 10px;
  }
`;

export function GlowCard({
  children,
  className,
  glowColor = "purple",
  customSize = false,
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const { base, spread } = glowColorMap[glowColor];

  useEffect(() => {
    const syncPointer = (e: PointerEvent) => {
      if (!cardRef.current) return;
      cardRef.current.style.setProperty("--x", e.clientX.toFixed(2));
      cardRef.current.style.setProperty("--xp", (e.clientX / window.innerWidth).toFixed(2));
      cardRef.current.style.setProperty("--y", e.clientY.toFixed(2));
      cardRef.current.style.setProperty("--yp", (e.clientY / window.innerHeight).toFixed(2));
    };
    document.addEventListener("pointermove", syncPointer);
    return () => document.removeEventListener("pointermove", syncPointer);
  }, []);

  const inlineStyles: React.CSSProperties = {
    "--base": base,
    "--spread": spread,
    "--radius": "14",
    "--border": "1.5",
    "--backdrop": "hsl(0 0% 5% / 0.85)",
    "--backup-border": "hsl(280 60% 30% / 0.25)",
    "--size": "220",
    "--outer": "1",
    "--border-size": "calc(var(--border, 2) * 1px)",
    "--spotlight-size": "calc(var(--size, 150) * 1px)",
    "--hue": "calc(var(--base) + (var(--xp, 0) * var(--spread, 0)))",
    backgroundImage: `radial-gradient(
      var(--spotlight-size) var(--spotlight-size) at
      calc(var(--x, 0) * 1px) calc(var(--y, 0) * 1px),
      hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 70) * 1%) / var(--bg-spot-opacity, 0.08)),
      transparent
    )`,
    backgroundColor: "var(--backdrop, transparent)",
    backgroundSize: "calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))",
    backgroundPosition: "50% 50%",
    backgroundAttachment: "fixed",
    border: "var(--border-size) solid var(--backup-border)",
    position: "relative",
    touchAction: "none",
  } as React.CSSProperties;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: beforeAfterCSS }} />
      <div
        ref={cardRef}
        data-glow
        style={inlineStyles}
        className={cn(
          "rounded-2xl relative grid shadow-[0_1rem_2rem_-1rem_black] backdrop-blur-sm",
          !customSize && "w-64 h-80 aspect-[3/4] grid-rows-[1fr_auto] p-4 gap-4",
          className,
        )}
      >
        <div ref={innerRef} data-glow />
        {children}
      </div>
    </>
  );
}
