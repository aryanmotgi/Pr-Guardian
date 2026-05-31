"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePipelineEvents } from "@/app/hooks/usePipelineEvents";
import { AuroraBackground } from "@/app/components/ui/aurora-background";
import { GooeyText } from "@/app/components/ui/gooey-text";
import { LivePulse } from "@/app/components/ui/live-pulse";
import { BlurFade } from "@/app/components/ui/blur-fade";
import { RobotCanvas, CornerRobot, MOODS, type RobotMood } from "./RobotCompanion";
import { PRCard } from "./PRCard";
import { TriggerPanel } from "./TriggerPanel";
import type { PRRun } from "@/app/types";

// ── Title morph word-sets (toggle live in dev panel) ─────────────────
const MORPH_SETS: Record<string, string[]> = {
  "PR ⇄ Guardian":                 ["PR", "Guardian"],
  "Reviewing → Fixing → Guardian": ["Reviewing", "Fixing", "Guardian"],
  "PR Guardian ⇄ Always watching": ["PR Guardian", "Always watching"],
};

// ── Derive mood from live pipeline events ─────────────────────────────
// NOTE: `decision` only fires at the END of a run, so mid-run we infer
// mood from which steps have become active instead.
function deriveMood(runs: PRRun[]): RobotMood {
  if (runs.length === 0) return "idle";
  const latest = runs[0];
  if (latest.done) {
    if (latest.decision === "allow") return "allowed";
    if (latest.decision === "escalate") return "escalate";
    if (latest.decision === "violation") return "solved";
    return "idle";
  }
  const touched = (s: keyof PRRun["steps"]) =>
    ["running", "pass", "fail"].includes(latest.steps[s].status);
  const isFixing = (["fix", "test", "retry", "merge", "receipt"] as const).some(touched);
  return isFixing ? "fixing" : "thinking";
}

export function Dashboard() {
  const { runs, trigger } = usePipelineEvents();

  // Dev overrides
  const [forcedMood, setForcedMood] = useState<RobotMood | null>(null);
  const [morphKey, setMorphKey] = useState<string>("PR ⇄ Guardian");
  const [panelOpen, setPanelOpen] = useState(true);

  const liveMood = deriveMood(runs);
  const mood = forcedMood ?? liveMood;
  const spec = MOODS[mood];

  // Shrink hero robot to corner companion on scroll
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 360);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const morphTexts = useMemo(() => MORPH_SETS[morphKey], [morphKey]);

  return (
    <div className="relative min-h-screen">
      {/* Aurora — no more plain black */}
      <AuroraBackground hueShift={spec.auroraHue} />

      <div className="relative z-20 flex min-h-screen flex-col pb-20">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="border-b border-violet-900/30 bg-gray-950/30 px-6 py-4 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <BlurFade delay={0} yOffset={-4}>
              <div className="flex items-center gap-3">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_16px_rgba(124,58,237,0.6)]">
                  <span className="text-xs font-black text-white">PG</span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
                  Autonomous&nbsp;security&nbsp;agent
                </p>
              </div>
            </BlurFade>
            <BlurFade delay={0.05} yOffset={-4}>
              <LivePulse label="Listening for webhooks" />
            </BlurFade>
          </div>
        </header>

        {/* ── Hero: left column (text) + right column (robot) ─────── */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-6 px-4 pt-10 pb-4 md:grid-cols-[1.1fr_0.9fr] md:pt-14">
          {/* LEFT — eyebrow, robot greeting chip, gooey title, copy, trigger */}
          <div className="order-2 md:order-1 space-y-4">
            <BlurFade delay={0.08}>
              <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-violet-300/70">
                It opens a PR — the Guardian does the rest
              </p>
            </BlurFade>

            {/* Robot greeting chip — lives here, NOT on top of the robot */}
            <BlurFade delay={0.12}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={mood}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-sm"
                  style={{
                    borderColor: spec.accent,
                    background: `${spec.glow.replace("0.55", "0.12").replace("0.6", "0.12")}`,
                    color: spec.accent,
                    boxShadow: `0 0 18px ${spec.glow.replace("0.55", "0.3").replace("0.6", "0.3")}`,
                  }}
                >
                  <span className="text-base leading-none">🤖</span>
                  {spec.greeting}
                </motion.div>
              </AnimatePresence>
            </BlurFade>

            {/* Gooey morphing title */}
            <GooeyText
              texts={morphTexts}
              morphTime={1.1}
              cooldownTime={1.4}
              className="h-[80px] w-full sm:h-[108px]"
              textClassName="font-[family-name:var(--font-display)] bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent sm:text-7xl"
            />

            <BlurFade delay={0.25}>
              <p className="max-w-md text-sm leading-relaxed text-gray-400">
                Reads the diff, judges{" "}
                <span className="text-violet-300">violation</span> /{" "}
                <span className="text-emerald-300">false alarm</span> /{" "}
                <span className="text-amber-300">escalate</span>, then fixes &
                merges in a sandbox — or pulls in a human when it&apos;s not sure.
              </p>
            </BlurFade>

            <BlurFade delay={0.32}>
              <div className="max-w-md">
                <TriggerPanel onTrigger={trigger} />
              </div>
            </BlurFade>
          </div>

          {/* RIGHT — clean robot canvas, no overlaid bubble */}
          <div className="order-1 h-[300px] md:order-2 md:h-[440px]">
            <BlurFade delay={0.15}>
              <div className="h-[300px] md:h-[440px]">
                <RobotCanvas mood={mood} />
              </div>
            </BlurFade>
          </div>
        </section>

        {/* ── PR checklist cards ───────────────────────────────────── */}
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-8">
          {runs.length === 0 ? (
            <BlurFade delay={0.2}>
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-violet-900/20 bg-gray-950/30 px-6 text-center backdrop-blur-sm">
                <p className="text-lg font-semibold text-gray-300">Waiting for a PR…</p>
                <p className="mt-2 max-w-xs text-sm text-gray-500">
                  Open a PR on the demo repo or hit a trigger above — the
                  Guardian reacts in real time.
                </p>
              </div>
            </BlurFade>
          ) : (
            runs.map((run, i) => <PRCard key={run.id} run={run} index={i} />)
          )}
        </main>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <footer className="border-t border-violet-900/20 px-6 py-3">
          <div className="mx-auto flex max-w-6xl items-center justify-between font-mono text-[10px] text-gray-700">
            <span>PR Guardian · hackathon build</span>
            <span className="text-violet-900">
              trigger → decide → fix → test → merge → prove → announce
            </span>
          </div>
        </footer>
      </div>

      {/* ── Corner companion (scrolled-down) ────────────────────────── */}
      <AnimatePresence>
        {scrolled && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="fixed bottom-5 right-5 z-40"
          >
            <CornerRobot mood={mood} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DEV PREVIEW PANEL — remove before shipping ──────────────── */}
      <div className="fixed bottom-5 left-5 z-50 font-mono">
        <button
          onClick={() => setPanelOpen((o) => !o)}
          className="mb-2 rounded-md border border-violet-700/50 bg-gray-950/80 px-2.5 py-1 text-[10px] uppercase tracking-widest text-violet-300 backdrop-blur"
        >
          {panelOpen ? "▾ hide" : "▸ dev preview"}
        </button>
        {panelOpen && (
          <div className="w-60 space-y-3 rounded-xl border border-violet-700/40 bg-gray-950/85 p-3 text-[11px] backdrop-blur-md">
            <div>
              <p className="mb-1.5 text-[9px] uppercase tracking-widest text-gray-500">
                Robot mood
              </p>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(MOODS) as RobotMood[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setForcedMood(m)}
                    className={`rounded px-1.5 py-1 capitalize transition ${
                      forcedMood === m
                        ? "bg-violet-600 text-white"
                        : "bg-violet-950/50 text-violet-300 hover:bg-violet-900/60"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setForcedMood(null)}
                className={`mt-1 w-full rounded px-1.5 py-1 transition ${
                  forcedMood === null
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
                }`}
              >
                Auto · follow pipeline ({liveMood})
              </button>
            </div>

            <div>
              <p className="mb-1.5 text-[9px] uppercase tracking-widest text-gray-500">
                Title morph
              </p>
              <div className="space-y-1">
                {Object.keys(MORPH_SETS).map((k) => (
                  <button
                    key={k}
                    onClick={() => setMorphKey(k)}
                    className={`w-full rounded px-2 py-1 text-left transition ${
                      morphKey === k
                        ? "bg-fuchsia-600 text-white"
                        : "bg-fuchsia-950/40 text-fuchsia-200 hover:bg-fuchsia-900/50"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
