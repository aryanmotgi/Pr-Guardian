"use client";

import { motion } from "framer-motion";
import { ShineBorder } from "@/app/components/ui/shine-border";
import { BlurFade } from "@/app/components/ui/blur-fade";
import { Badge } from "@/app/components/ui/badge";
import { StepRow } from "./StepRow";
import type { PRRun, PipelineStep } from "@/app/types";

// All steps, always rendered — the CI-checklist pattern.
// Pending steps show as "waiting…" until the pipeline fires them.
const STEP_ORDER: PipelineStep[] = [
  "trigger", "decide", "fix", "test", "retry", "merge", "receipt", "slack",
];

function DecisionBadge({ decision }: { decision: PRRun["decision"] }) {
  if (!decision) return null;
  const map = {
    violation: { variant: "violation" as const, label: "VIOLATION — FIXED" },
    allow:     { variant: "allow"     as const, label: "ALLOWED" },
    escalate:  { variant: "escalate"  as const, label: "ESCALATED" },
  };
  const { variant, label } = map[decision];
  return <Badge variant={variant}>{label}</Badge>;
}

function ProgressBar({ run }: { run: PRRun }) {
  const total = STEP_ORDER.length;
  const done = STEP_ORDER.filter(
    (s) => run.steps[s].status === "pass" || run.steps[s].status === "skipped",
  ).length;
  const pct = Math.round((done / total) * 100);

  const color =
    run.decision === "violation"
      ? "from-violet-500 to-emerald-400"
      : run.decision === "allow"
      ? "from-cyan-500 to-emerald-400"
      : run.decision === "escalate"
      ? "from-amber-500 to-amber-300"
      : "from-violet-500 to-blue-500";

  return (
    <div className="h-0.5 w-full rounded-full bg-gray-800 overflow-hidden">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  );
}

export function PRCard({ run, index }: { run: PRRun; index: number }) {
  const isActive = !run.done;

  const glowColors =
    run.decision === "violation"
      ? ["#ef4444", "#7f1d1d", "#ef4444"]
      : run.decision === "allow"
      ? ["#10b981", "#064e3b", "#10b981"]
      : run.decision === "escalate"
      ? ["#f59e0b", "#78350f", "#f59e0b"]
      : ["#7c3aed", "#2563eb", "#7c3aed"];

  const cardContent = (
    <div className="rounded-xl bg-gray-950/75 backdrop-blur-sm p-5 w-full space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-900/60 border border-violet-700/50 text-violet-300 text-[10px] font-bold flex-shrink-0 mt-0.5">
            #{run.prNumber}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-600 font-mono truncate">{run.branch}</p>
            <h2 className="text-white font-semibold text-sm leading-snug mt-0.5">
              {run.prTitle}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isActive && !run.decision && (
            <Badge variant="running">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse mr-0.5" />
              Running
            </Badge>
          )}
          <DecisionBadge decision={run.decision} />
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar run={run} />

      {/* Checklist — ALL steps, always */}
      <div className="pt-1">
        {STEP_ORDER.map((step, i) => (
          <StepRow
            key={step}
            step={step}
            state={run.steps[step]}
            isLast={i === STEP_ORDER.length - 1}
          />
        ))}
      </div>

      {run.done && (
        <div className="pt-2 border-t border-violet-900/20 space-y-1">
          {run.decision && (
            <p className={`text-xs font-medium ${
              run.decision === "violation" ? "text-emerald-400" :
              run.decision === "allow"     ? "text-cyan-400"    :
              "text-amber-400"
            }`}>
              {run.decision === "violation"
                ? "Violation caught and fixed automatically"
                : run.decision === "allow"
                ? "Recognized as safe test data — not a real leak"
                : "Too risky to auto-merge — flagged for human review"}
            </p>
          )}
          <p className="text-gray-700 text-[10px] font-mono">
            Completed · {new Date(run.startedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <BlurFade delay={index * 0.08} yOffset={12}>
      {isActive ? (
        <ShineBorder
          color={glowColors}
          duration={6}
          borderWidth={1.5}
          borderRadius={12}
        >
          {cardContent}
        </ShineBorder>
      ) : (
        <div className="rounded-xl border border-gray-800/60">{cardContent}</div>
      )}
    </BlurFade>
  );
}
