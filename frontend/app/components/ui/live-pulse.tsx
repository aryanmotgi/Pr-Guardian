"use client";

import { motion } from "framer-motion";
import { cn } from "@/app/lib/utils";

export function LivePulse({ className, label = "Live" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-gray-400", className)}>
      <span className="relative flex h-2 w-2">
        <motion.span
          className="absolute inline-flex h-full w-full rounded-full bg-violet-400"
          animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
      </span>
      {label}
    </span>
  );
}
