"use client";

// Source: easemize/glass-button — https://21st.dev/community/components/easemize/glass-button/default
// Styles use Tailwind arbitrary values only (no global CSS) for Turbopack compatibility.
import * as React from "react";
import { cn } from "@/app/lib/utils";

type GlassVariant = "default" | "violation" | "allow";

const variantConfig: Record<
  GlassVariant,
  { bg: string; bgHover: string; border: string; borderHover: string; shadow: string; shadowHover: string; text: string; glow: string; glowHover: string }
> = {
  default: {
    bg:          "from-violet-600/[0.28] to-violet-900/[0.18]",
    bgHover:     "hover:from-violet-500/[0.38] hover:to-violet-800/[0.28]",
    border:      "border-violet-300/25",
    borderHover: "hover:border-violet-200/45",
    shadow:      "shadow-[0_4px_24px_rgba(124,58,237,0.18),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)]",
    shadowHover: "hover:shadow-[0_4px_32px_rgba(124,58,237,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]",
    text:        "text-violet-200",
    glow:        "bg-violet-600/45",
    glowHover:   "group-hover:bg-violet-500/60",
  },
  violation: {
    bg:          "from-red-600/[0.28] to-red-900/[0.18]",
    bgHover:     "hover:from-red-500/[0.38] hover:to-red-800/[0.28]",
    border:      "border-red-300/20",
    borderHover: "hover:border-red-200/40",
    shadow:      "shadow-[0_4px_24px_rgba(239,68,68,0.18),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)]",
    shadowHover: "hover:shadow-[0_4px_32px_rgba(239,68,68,0.32),inset_0_1px_0_rgba(255,255,255,0.15)]",
    text:        "text-red-200",
    glow:        "bg-red-600/40",
    glowHover:   "group-hover:bg-red-500/60",
  },
  allow: {
    bg:          "from-emerald-600/[0.28] to-emerald-900/[0.18]",
    bgHover:     "hover:from-emerald-500/[0.38] hover:to-emerald-800/[0.28]",
    border:      "border-emerald-300/20",
    borderHover: "hover:border-emerald-200/40",
    shadow:      "shadow-[0_4px_24px_rgba(16,185,129,0.18),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.2)]",
    shadowHover: "hover:shadow-[0_4px_32px_rgba(16,185,129,0.32),inset_0_1px_0_rgba(255,255,255,0.15)]",
    text:        "text-emerald-200",
    glow:        "bg-emerald-600/40",
    glowHover:   "group-hover:bg-emerald-500/60",
  },
};

export interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlassVariant;
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, variant = "default", disabled, onClick, ...props }, ref) => {
    const v = variantConfig[variant];

    return (
      <div className={cn("relative w-full group", disabled && "opacity-50 pointer-events-none", className)}>
        <button
          ref={ref}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            // Layout
            "relative w-full overflow-hidden rounded-full px-6 py-3.5 cursor-pointer",
            // Glass background
            "bg-gradient-to-br backdrop-blur-md",
            v.bg, v.bgHover,
            // Border
            "border", v.border, v.borderHover,
            // Top inner highlight via pseudo-element
            "before:content-[''] before:absolute before:top-0 before:inset-x-0 before:h-1/2 before:bg-gradient-to-b before:from-white/10 before:to-transparent before:rounded-t-full before:pointer-events-none",
            // Shadow
            v.shadow, v.shadowHover,
            // Hover lift
            "hover:-translate-y-0.5 active:translate-y-0",
            // Transition
            "transition-all duration-300",
          )}
          {...props}
        >
          <span className={cn("relative z-10 block text-sm font-semibold tracking-tight select-none text-center", v.text)}>
            {children}
          </span>
        </button>

        {/* Glow shadow beneath the button */}
        <div
          className={cn(
            "absolute left-[15%] right-[15%] h-4 rounded-full blur-[14px] pointer-events-none",
            "bottom-[-8px] group-hover:bottom-[-12px]",
            "transition-all duration-300",
            v.glow, v.glowHover,
          )}
        />
      </div>
    );
  },
);
GlassButton.displayName = "GlassButton";
