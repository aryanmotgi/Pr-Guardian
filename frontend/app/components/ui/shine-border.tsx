"use client";

import { cn } from "@/app/lib/utils";

type TColorProp = string | string[];

interface ShineBorderProps {
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  color?: TColorProp;
  className?: string;
  children: React.ReactNode;
}

export function ShineBorder({
  borderRadius = 12,
  borderWidth = 1,
  duration = 8,
  color = ["#7c3aed", "#2563eb", "#7c3aed"],
  className,
  children,
}: ShineBorderProps) {
  return (
    <div
      style={{ "--border-radius": `${borderRadius}px` } as React.CSSProperties}
      className={cn("relative w-full rounded-[--border-radius]", className)}
    >
      <style>{`@keyframes shine-orbit { 0%{background-position:0% 0%} 50%{background-position:100% 100%} to{background-position:0% 0%} }`}</style>
      <div
        style={
          {
            "--border-width": `${borderWidth}px`,
            "--border-radius": `${borderRadius}px`,
            "--duration": `${duration}s`,
            "--mask-linear-gradient": `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
            "--background-radial-gradient": `radial-gradient(transparent,transparent, ${color instanceof Array ? color.join(",") : color},transparent,transparent)`,
          } as React.CSSProperties
        }
        className="pointer-events-none absolute inset-0 rounded-[--border-radius] before:absolute before:inset-0 before:aspect-square before:size-full before:rounded-[--border-radius] before:p-[--border-width] before:will-change-[background-position] before:content-[''] before:![-webkit-mask-composite:xor] before:![mask-composite:exclude] before:[background-image:--background-radial-gradient] before:[background-size:300%_300%] before:[mask:--mask-linear-gradient] before:[animation:shine-orbit_var(--duration,8s)_infinite_linear]"
      />
      {children}
    </div>
  );
}
