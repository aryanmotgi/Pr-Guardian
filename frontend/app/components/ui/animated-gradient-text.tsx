// Source: magicui/animated-gradient-text — https://21st.dev/r/magicui/animated-gradient-text
// Uses inline style for keyframe animation (Turbopack-safe; no globals.css dependency).
import { cn } from "@/app/lib/utils";
import { type ReactNode } from "react";

export function AnimatedGradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("bg-clip-text text-transparent", className)}
      style={{
        backgroundImage: "linear-gradient(90deg, #a78bfa, #60a5fa, #a78bfa)",
        backgroundSize: "200% 100%",
        animation: "gradient-sweep 4s linear infinite",
      }}
    >
      <style>{`@keyframes gradient-sweep { to { background-position: 200% 0; } }`}</style>
      {children}
    </span>
  );
}
