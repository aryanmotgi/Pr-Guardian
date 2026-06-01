"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/app/lib/utils";

function generateStars(count: number, color: string) {
  const shadows: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 4000) - 2000;
    const y = Math.floor(Math.random() * 4000) - 2000;
    shadows.push(`${x}px ${y}px ${color}`);
  }
  return shadows.join(", ");
}

function StarLayer({
  count,
  size,
  duration,
  color,
}: {
  count: number;
  size: number;
  duration: number;
  color: string;
}) {
  const [boxShadow, setBoxShadow] = React.useState("");

  React.useEffect(() => {
    setBoxShadow(generateStars(count, color));
  }, [count, color]);

  return (
    <motion.div
      animate={{ y: [0, -2000] }}
      transition={{ repeat: Infinity, duration, ease: "linear" }}
      className="absolute top-0 left-0 w-full h-[2000px]"
    >
      <div
        className="absolute bg-transparent rounded-full"
        style={{ width: size, height: size, boxShadow }}
      />
      <div
        className="absolute bg-transparent rounded-full top-[2000px]"
        style={{ width: size, height: size, boxShadow }}
      />
    </motion.div>
  );
}

export function StarsBackground({
  children,
  className,
  starColor = "rgba(167,139,250,0.7)",
}: {
  children?: React.ReactNode;
  className?: string;
  starColor?: string;
}) {
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const springX = useSpring(offsetX, { stiffness: 50, damping: 20 });
  const springY = useSpring(offsetY, { stiffness: 50, damping: 20 });

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      offsetX.set(-(e.clientX - cx) * 0.04);
      offsetY.set(-(e.clientY - cy) * 0.04);
    },
    [offsetX, offsetY],
  );

  return (
    <div
      className={cn("relative size-full overflow-hidden bg-[radial-gradient(ellipse_at_bottom,_#1a0a2e_0%,_#030712_100%)]", className)}
      onMouseMove={handleMouseMove}
    >
      <motion.div style={{ x: springX, y: springY }}>
        <StarLayer count={800} size={1} duration={60} color={starColor} />
        <StarLayer count={300} size={2} duration={120} color={starColor} />
        <StarLayer count={100} size={3} duration={180} color={starColor} />
      </motion.div>
      {children}
    </div>
  );
}
