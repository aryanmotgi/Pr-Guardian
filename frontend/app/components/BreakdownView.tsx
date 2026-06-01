"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { PRRun, PipelineStep } from "@/app/types";

const LAST_RUN_KEY = "pr_guardian_last_run";

// Bad code is always the demo violation
const BAD_CODE = `  console.log("Processing payment", {
    cardNumber: pan,        // ← full PAN logged in plaintext
    amount,
    currency,
  });`;

const STEP_META: Record<
  PipelineStep,
  { label: string; emoji: string; sponsor: string; sponsorColor: string; explanation: string }
> = {
  trigger: {
    label: "Trigger",
    emoji: "⚡",
    sponsor: "Insforge",
    sponsorColor: "text-cyan-400",
    explanation:
      "A GitHub webhook fired when the PR was opened. Insforge received the event, stored state, and woke the agent — no polling required.",
  },
  decide: {
    label: "Decide",
    emoji: "🧠",
    sponsor: "Claude (Anthropic)",
    sponsorColor: "text-violet-400",
    explanation:
      "Claude read the full PR diff and checked it against the hardcoded ruleset. Identified a credit card PAN being written to application logs — a PCI-DSS violation. Confidence: HIGH.",
  },
  fix: {
    label: "Fix",
    emoji: "🛠️",
    sponsor: "Daytona + Claude",
    sponsorColor: "text-blue-400",
    explanation:
      "Daytona spun up an isolated sandbox. Claude was given the bad line, the surrounding context, and the rule — then rewrote the offending code to redact the card number before logging.",
  },
  test: {
    label: "Test",
    emoji: "🧪",
    sponsor: "Daytona",
    sponsorColor: "text-blue-400",
    explanation:
      "The full test suite ran inside the Daytona sandbox against the patched code. No mocks — real code, real tests, real result.",
  },
  retry: {
    label: "Retry",
    emoji: "↺",
    sponsor: "Kalibr",
    sponsorColor: "text-amber-400",
    explanation:
      "A previous attempt failed a test. Kalibr captured the failure output and routed it back to Claude as context. Claude self-corrected with a better fix — this is the self-healing loop.",
  },
  merge: {
    label: "Merge",
    emoji: "🔀",
    sponsor: "GitHub API",
    sponsorColor: "text-emerald-400",
    explanation:
      "Once tests passed, the fix was committed and merged to main via GitHub API using Octokit. No human required — the agent handled the full merge.",
  },
  receipt: {
    label: "Receipt",
    emoji: "🧾",
    sponsor: "Tigris + GitHub",
    sponsorColor: "text-orange-400",
    explanation:
      "A detailed audit comment was posted on the PR explaining what was found, what was fixed, and why. The full receipt — diff, logs, decision — was stored in Tigris object storage.",
  },
  slack: {
    label: "Slack",
    emoji: "🔔",
    sponsor: "Slack API",
    sponsorColor: "text-green-400",
    explanation:
      "A ping landed in #security-alerts with the PR link, decision, fix summary, and a link to the Tigris receipt. Human is informed without needing to act.",
  },
};

const STEP_ORDER: PipelineStep[] = [
  "trigger", "decide", "fix", "test", "retry", "merge", "receipt", "slack",
];

function statusColor(status: string) {
  switch (status) {
    case "pass":    return "text-emerald-400 border-emerald-500/40 bg-emerald-950/30";
    case "fail":    return "text-red-400 border-red-500/40 bg-red-950/30";
    case "running": return "text-violet-400 border-violet-500/40 bg-violet-950/30";
    case "skipped": return "text-gray-500 border-gray-700/40 bg-gray-900/30";
    default:        return "text-gray-600 border-gray-800/40 bg-gray-900/20";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "pass":    return "✓ PASSED";
    case "fail":    return "✕ FAILED";
    case "running": return "● RUNNING";
    case "skipped": return "— SKIPPED";
    default:        return "· PENDING";
  }
}

function DiffBlock({ bad, fixed }: { bad: string; fixed?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden font-mono text-xs">
      <div className="px-4 py-2 bg-gray-900/60 text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800">
        Before / After
      </div>
      {/* Bad code */}
      <div className="bg-red-950/20 px-4 py-3 border-b border-gray-800">
        <div className="text-[10px] text-red-500/70 mb-1.5 uppercase tracking-widest">− violation</div>
        <pre className="text-red-300/90 whitespace-pre-wrap leading-relaxed">{bad}</pre>
      </div>
      {/* Fixed code */}
      <div className="bg-emerald-950/20 px-4 py-3">
        <div className="text-[10px] text-emerald-500/70 mb-1.5 uppercase tracking-widest">+ fix applied</div>
        {fixed ? (
          <pre className="text-emerald-300/90 whitespace-pre-wrap leading-relaxed">{fixed}</pre>
        ) : (
          <p className="text-gray-600 italic">Fix detail not captured in this run</p>
        )}
      </div>
    </div>
  );
}

function StepCard({ step, run, index }: { step: PipelineStep; run: PRRun; index: number }) {
  const meta  = STEP_META[step];
  const state = run.steps[step];
  const skip  = state.status === "pending" && !state.message;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-xl border p-4 ${skip ? "opacity-30" : ""} border-gray-800/60 bg-gray-950/50`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-lg">
          {meta.emoji}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: label + status badge + timestamp */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] uppercase tracking-widest font-bold text-gray-200">
              {meta.label}
            </span>
            <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-widest ${statusColor(state.status)}`}>
              {statusLabel(state.status)}
            </span>
            {state.timestamp && (
              <span className="ml-auto font-mono text-[10px] text-gray-600">{state.timestamp}</span>
            )}
          </div>

          {/* Row 2: sponsor */}
          <p className={`text-[10px] font-mono mt-0.5 ${meta.sponsorColor}`}>
            Powered by {meta.sponsor}
          </p>

          {/* Row 3: explanation */}
          <p className="mt-2 text-sm text-gray-400 leading-relaxed">
            {meta.explanation}
          </p>

          {/* Row 4: actual message from pipeline */}
          {state.message && (
            <div className="mt-2 rounded-lg bg-gray-900/60 border border-gray-800/60 px-3 py-2">
              <p className="font-mono text-[11px] text-gray-300">{state.message}</p>
              {state.detail && (
                <p className="font-mono text-[10px] text-gray-600 mt-0.5 truncate">└ {state.detail}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800/60 bg-gray-950/50 px-4 py-3 text-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-gray-600">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-100">{value}</p>
    </div>
  );
}

export function BreakdownView() {
  const [run, setRun] = useState<PRRun | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_RUN_KEY);
      if (raw) setRun(JSON.parse(raw) as PRRun);
    } catch { /* ignore */ }
  }, []);

  if (!run) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-300">No run yet</p>
          <p className="mt-2 text-sm text-gray-500">Trigger a pipeline from the main page first.</p>
          <a href="/" className="mt-4 inline-block text-sm text-violet-400 hover:text-violet-300">
            ← Back to live feed
          </a>
        </div>
      </div>
    );
  }

  const startMs  = new Date(run.startedAt).getTime();
  const endMs    = run.endedAt ? new Date(run.endedAt).getTime() : Date.now();
  const durSec   = Math.round((endMs - startMs) / 1000);
  const durLabel = durSec >= 60 ? `${Math.floor(durSec / 60)}m ${durSec % 60}s` : `${durSec}s`;
  const attempts = run.attempts ?? 1;

  const decisionColor =
    run.decision === "violation" ? "text-red-400" :
    run.decision === "allow"     ? "text-emerald-400" :
    run.decision === "escalate"  ? "text-amber-400" :
    "text-gray-400";

  const decisionLabel =
    run.decision === "violation" ? "VIOLATION — FIXED" :
    run.decision === "allow"     ? "ALLOWED (false alarm)" :
    run.decision === "escalate"  ? "ESCALATED TO HUMAN" :
    "IN PROGRESS";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      {/* Back link */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <a
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-gray-600 hover:text-violet-400 transition"
        >
          ← Live feed
        </a>
      </motion.div>

      {/* Run header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-2"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[10px] text-gray-600 uppercase tracking-widest">
            PR #{run.prNumber} · {run.branch}
          </span>
          <span className={`font-mono text-[11px] font-bold uppercase tracking-widest ${decisionColor}`}>
            {decisionLabel}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-100 leading-snug">{run.prTitle}</h1>
        <p className="font-mono text-[11px] text-gray-600">
          Started {new Date(run.startedAt).toLocaleString()}
        </p>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.35 }}
        className="grid grid-cols-3 gap-3"
      >
        <StatPill label="Duration" value={durLabel} />
        <StatPill label="Attempts" value={`${attempts}`} />
        <StatPill
          label="Decision"
          value={run.decision === "violation" ? "Fixed" : run.decision === "allow" ? "Allowed" : run.decision === "escalate" ? "Escalated" : "—"}
        />
      </motion.div>

      {/* Before/after diff */}
      {run.decision === "violation" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.35 }}
        >
          <DiffBlock bad={BAD_CODE} fixed={run.fixedCode} />
        </motion.div>
      )}

      {/* Step-by-step breakdown */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-gray-600 mb-4">
          Pipeline steps
        </p>
        <div className="space-y-3">
          {STEP_ORDER.map((step, i) => (
            <StepCard key={step} step={step} run={run} index={i} />
          ))}
        </div>
      </div>

      {/* Tigris receipt link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="rounded-xl border border-orange-900/30 bg-orange-950/20 px-5 py-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-500/70 mb-0.5">
              Tigris receipt
            </p>
            <p className="text-sm text-gray-400">
              Full audit trail — diff, logs, decision — stored in Tigris object storage.
            </p>
          </div>
          <a
            href="https://pr-guardian-fix-engine.onrender.com/receipts"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 rounded-lg border border-orange-700/40 bg-orange-950/40 px-3 py-2 font-mono text-[11px] text-orange-300 transition hover:bg-orange-900/40 hover:border-orange-600/50"
          >
            View receipt →
          </a>
        </div>
      </motion.div>
    </div>
  );
}
