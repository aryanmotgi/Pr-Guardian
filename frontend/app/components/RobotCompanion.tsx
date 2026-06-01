"use client";

// The Guardian robot — friendly greeter, not a narrator.
// Personality = mood-glow + canvas hue-tint + short spoken chip in the left column.
// The hosted Spline scene cannot be sculpted from code; emotion comes from
// the CSS layers we control around it.
import { motion } from "framer-motion";
import { SplineScene } from "@/app/components/ui/spline-scene";

const SCENE = "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

export type RobotMood =
  | "idle"
  | "thinking"
  | "fixing"
  | "solved"
  | "allowed"
  | "escalate";

interface MoodSpec {
  /** Short, friendly greeting — NOT a pipeline narrative */
  greeting: string;
  glow: string;
  accent: string;
  /** hue-rotate on the robot canvas (base scene reads blue/teal) */
  canvasHue: number;
  /** nudge the aurora field toward this mood */
  auroraHue: number;
}

export const MOODS: Record<RobotMood, MoodSpec> = {
  idle: {
    greeting: "Hey! 👋  Open a PR and I'll take it from here.",
    glow: "rgba(139,92,246,0.55)",
    accent: "rgba(167,139,250,0.9)",
    canvasHue: 0,
    auroraHue: 0,
  },
  thinking: {
    greeting: "On it — reading the diff now. 🔍",
    glow: "rgba(56,189,248,0.55)",
    accent: "rgba(125,211,252,0.95)",
    canvasHue: -28,
    auroraHue: -34,
  },
  fixing: {
    greeting: "Found one. Patching it in a sandbox! 🛠️",
    glow: "rgba(139,92,246,0.6)",
    accent: "rgba(196,181,253,0.95)",
    canvasHue: 10,
    auroraHue: 8,
  },
  solved: {
    greeting: "Fixed, tests green, merged. You're good! ✅",
    glow: "rgba(16,185,129,0.6)",
    accent: "rgba(110,231,183,0.95)",
    canvasHue: 235,
    auroraHue: 150,
  },
  allowed: {
    greeting: "False alarm — test data in a test file. Allowed! 👍",
    glow: "rgba(45,212,191,0.55)",
    accent: "rgba(153,246,228,0.95)",
    canvasHue: 215,
    auroraHue: 130,
  },
  escalate: {
    greeting: "Too risky to auto-merge — flagged for human review. 🙋",
    glow: "rgba(245,158,11,0.6)",
    accent: "rgba(253,224,71,0.95)",
    canvasHue: 150,
    auroraHue: 90,
  },
};

/** The 3-D robot — just the canvas + mood glow. No overlaid bubble. */
export function RobotCanvas({
  mood,
  onLoad,
}: {
  mood: RobotMood;
  onLoad?: () => void;
}) {
  const spec = MOODS[mood];

  return (
    <div className="relative h-full w-full">
      {/* Mood glow behind the robot */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: "75%", height: "75%" }}
        animate={{
          background: `radial-gradient(circle, ${spec.glow} 0%, transparent 68%)`,
          opacity: [0.65, 0.95, 0.65],
        }}
        transition={{
          background: { duration: 1 },
          opacity: { duration: 4, repeat: Infinity, ease: "easeInOut" },
        }}
      />

      {/* Canvas — edge-masked + hue-tinted */}
      <div
        className="absolute inset-0"
        style={{
          filter: `hue-rotate(${spec.canvasHue}deg) drop-shadow(0 24px 60px ${spec.glow})`,
          transition: "filter 1.1s ease",
          maskImage:
            "radial-gradient(ellipse 78% 78% at 50% 46%, #000 55%, transparent 86%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 78% 78% at 50% 46%, #000 55%, transparent 86%)",
        }}
      >
        <SplineScene scene={SCENE} className="h-full w-full" onLoad={onLoad} />
      </div>
    </div>
  );
}

/** Corner companion — compact bot with bubble, shown on scroll */
export function CornerRobot({ mood }: { mood: RobotMood }) {
  const spec = MOODS[mood];
  return (
    <div className="flex items-end gap-2">
      <motion.div
        key={mood}
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 10 }}
        className="mb-1 max-w-[12rem] rounded-2xl border bg-gray-950/80 px-3 py-2 text-xs leading-snug text-gray-100 shadow-2xl backdrop-blur-md"
        style={{ borderColor: spec.accent, boxShadow: `0 0 20px ${spec.glow}` }}
      >
        {spec.greeting}
      </motion.div>
      <motion.div
        className="relative grid h-14 w-14 place-items-center rounded-2xl border"
        animate={{
          background: `radial-gradient(circle at 50% 35%, ${spec.glow}, rgba(3,7,18,0.9))`,
        }}
        style={{ borderColor: spec.accent }}
      >
        <motion.span
          className="text-2xl"
          animate={{ rotate: [0, -8, 8, 0], y: [0, -1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          🤖
        </motion.span>
        <span
          className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full"
          style={{
            background: spec.accent,
            boxShadow: `0 0 10px ${spec.accent}`,
          }}
        />
      </motion.div>
    </div>
  );
}
