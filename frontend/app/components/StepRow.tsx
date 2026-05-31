"use client";

import { motion } from "framer-motion";
import type { PipelineStep, StepState, StepStatus } from "@/app/types";

const STEP_META: Record<PipelineStep, { label: string; emoji: string }> = {
  trigger: { label: "Trigger",  emoji: "⚡" },
  decide:  { label: "Decide",   emoji: "🧠" },
  fix:     { label: "Fix",      emoji: "🛠️" },
  test:    { label: "Test",     emoji: "🧪" },
  retry:   { label: "Retry",    emoji: "↺"  },
  merge:   { label: "Merge",    emoji: "🔀" },
  receipt: { label: "Receipt",  emoji: "🧾" },
  slack:   { label: "Slack",    emoji: "🔔" },
};

function StepDot({ status, isRetry }: { status: StepStatus; isRetry?: boolean }) {
  if (status === "running") {
    return (
      <span className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-40" />
        <span className="relative h-3 w-3 rounded-full bg-violet-400" />
      </span>
    );
  }

  const cfg: Record<StepStatus, { bg: string; border: string; symbol: string; text: string }> = {
    pass:    { bg: "bg-emerald-500",     border: "border-emerald-500",    symbol: "✓", text: "text-white"       },
    fail:    { bg: "bg-red-500",         border: "border-red-500",        symbol: "✕", text: "text-white"       },
    skipped: { bg: "bg-transparent",     border: "border-gray-700",       symbol: "—", text: "text-gray-600"    },
    pending: { bg: "bg-transparent",     border: "border-gray-700/50",    symbol: "",  text: "text-gray-700"    },
  };

  // Retry step gets amber treatment even when "pass" (it's always a retry)
  if (isRetry && status === "pass") {
    return (
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-amber-500 bg-amber-500/20 text-[10px] font-bold text-amber-400">
        ↺
      </span>
    );
  }

  const { bg, border, symbol, text } = cfg[status];
  return (
    <span
      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${bg} ${border} ${text}`}
    >
      {symbol}
    </span>
  );
}

export function StepRow({
  step,
  state,
  isLast,
}: {
  step: PipelineStep;
  state: StepState;
  isLast: boolean;
}) {
  const { label } = STEP_META[step];
  const isRetry = step === "retry";
  const isPending = state.status === "pending" && !state.message;
  const isRunning = state.status === "running";

  const rowVariants = {
    hidden: { opacity: 0, x: -6 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <motion.div
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      className="flex gap-3"
    >
      {/* Track + dot column */}
      <div className="flex flex-col items-center">
        <StepDot status={state.status} isRetry={isRetry} />
        {!isLast && (
          <div
            className="mt-1 w-px flex-1"
            style={{
              minHeight: 20,
              background:
                state.status === "pass" || (isRetry && state.status === "pass")
                  ? "linear-gradient(to bottom, rgba(52,211,153,0.5), rgba(52,211,153,0.15))"
                  : state.status === "fail"
                  ? "linear-gradient(to bottom, rgba(248,113,113,0.5), rgba(248,113,113,0.15))"
                  : state.status === "running"
                  ? "linear-gradient(to bottom, rgba(167,139,250,0.6), rgba(167,139,250,0.1))"
                  : "rgba(55,65,81,0.4)",
            }}
          />
        )}
      </div>

      {/* Content column */}
      <div
        className={`pb-4 flex-1 min-w-0 ${isLast ? "pb-1" : ""} ${isPending ? "opacity-35" : ""}`}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.15em] font-semibold ${
              isRetry && state.status !== "pending"
                ? "text-amber-400"
                : state.status === "pass"
                ? "text-emerald-400"
                : state.status === "fail"
                ? "text-red-400"
                : state.status === "running"
                ? "text-violet-400"
                : "text-gray-600"
            }`}
          >
            {label}
          </span>

          {/* Message */}
          {state.message && (
            <span
              className={`text-xs leading-snug ${
                state.status === "fail"
                  ? "text-red-300"
                  : state.status === "pass"
                  ? "text-gray-200"
                  : isRunning
                  ? "text-violet-200"
                  : "text-gray-400"
              }`}
            >
              {state.message}
            </span>
          )}

          {isPending && (
            <span className="text-[11px] text-gray-700 italic">waiting…</span>
          )}

          {state.timestamp && (
            <span className="ml-auto text-[10px] text-gray-700 font-mono flex-shrink-0">
              {state.timestamp}
            </span>
          )}
        </div>

        {/* Detail line */}
        {state.detail && (
          <p className="mt-0.5 font-mono text-[10px] text-gray-600 truncate">
            └ {state.detail}
          </p>
        )}
      </div>
    </motion.div>
  );
}
