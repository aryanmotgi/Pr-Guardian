import { cn } from "@/app/lib/utils";
import * as React from "react";

type BadgeVariant = "violation" | "allow" | "escalate" | "running" | "neutral";

const variantStyles: Record<BadgeVariant, string> = {
  violation:
    "border-red-700/60 bg-red-950/60 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.3)]",
  allow:
    "border-emerald-700/60 bg-emerald-950/60 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.3)]",
  escalate:
    "border-yellow-700/60 bg-yellow-950/60 text-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.3)]",
  running:
    "border-violet-700/60 bg-violet-950/60 text-violet-300 shadow-[0_0_12px_rgba(167,139,250,0.3)]",
  neutral:
    "border-gray-700/60 bg-gray-900/60 text-gray-400",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold tracking-wide transition-all",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
