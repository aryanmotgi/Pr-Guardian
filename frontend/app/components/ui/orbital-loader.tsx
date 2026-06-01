"use client";

import { motion } from "framer-motion";

export function OrbitalLoader({ size = 16 }: { size?: number }) {
  return (
    <span className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Outer ring */}
      <motion.span
        className="absolute inset-0 rounded-full border border-violet-500/20"
        style={{ width: size, height: size }}
      />
      {/* Spinning arc */}
      <motion.span
        className="absolute inset-0 rounded-full border border-transparent border-t-violet-400"
        style={{ width: size, height: size }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner pulse */}
      <motion.span
        className="absolute rounded-full bg-violet-500/40"
        style={{
          width: size * 0.4,
          height: size * 0.4,
          top: size * 0.3,
          left: size * 0.3,
        }}
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  );
}
