"use client";

import React from "react";
import { cn } from "@/app/lib/utils";

type ShinyVariant = "violation" | "allow" | "default";

const variantClasses: Record<ShinyVariant, string> = {
  violation:
    "bg-[linear-gradient(325deg,#7f1d1d_0%,#ef4444_55%,#7f1d1d_90%)] shadow-[0px_0px_20px_rgba(239,68,68,0.4),0px_5px_5px_-1px_rgba(220,38,38,0.25),inset_4px_4px_8px_rgba(254,202,202,0.3),inset_-4px_-4px_8px_rgba(127,29,29,0.35)]",
  allow:
    "bg-[linear-gradient(325deg,#064e3b_0%,#10b981_55%,#064e3b_90%)] shadow-[0px_0px_20px_rgba(16,185,129,0.4),0px_5px_5px_-1px_rgba(5,150,105,0.25),inset_4px_4px_8px_rgba(167,243,208,0.3),inset_-4px_-4px_8px_rgba(6,78,59,0.35)]",
  default:
    "bg-[linear-gradient(325deg,#4c1d95_0%,#7c3aed_55%,#4c1d95_90%)] shadow-[0px_0px_20px_rgba(124,58,237,0.4),0px_5px_5px_-1px_rgba(109,40,217,0.25),inset_4px_4px_8px_rgba(221,214,254,0.3),inset_-4px_-4px_8px_rgba(76,29,149,0.35)]",
};

interface ShinyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  variant?: ShinyVariant;
}

export function ShinyButton({
  className,
  children,
  variant = "default",
  ...props
}: ShinyButtonProps) {
  return (
    <button
      className={cn(
        "h-11 w-full rounded-lg border-none bg-[size:280%_auto] px-5 py-2 font-semibold text-sm text-white transition-[background-position] duration-700 hover:[background-position:right_top] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
