"use client";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PipelineEvent, PRRun, PipelineStep, StepState, Decision } from "@/app/types";

const BACKEND = "https://pr-guardian-fix-engine.onrender.com";
export const ENDPOINTS = {
  events: "/api/events",          // proxied server-side — no CORS
  fix:    `${BACKEND}/fix`,
  health: `${BACKEND}/health`,
} as const;

// Hardcoded demo violation — what the backup buttons fire against Render
const DEMO_VIOLATION = {
  pr:        { owner: "ssmoney1", repo: "acme-payments", number: 3, title: "feat: add payment debug logging" },
  violation: { file: "src/payment.js", reason: "logs full card number", line: 23, bad_code: "    cardNumber: pan," },
};

const STEPS: PipelineStep[] = ["trigger", "decide", "fix", "test", "retry", "merge", "receipt", "slack"];

function blankRun(runId: string, prNumber: number, prTitle?: string): PRRun {
  const steps = Object.fromEntries(
    STEPS.map((s) => [s, { status: "pending", message: "" } satisfies StepState])
  ) as Record<PipelineStep, StepState>;
  return {
    id: runId,
    prNumber,
    prTitle: prTitle ?? (prNumber === 1
      ? "feat: add payment debug logging (REAL violation)"
      : "test: use standard Stripe test card (decoy)"),
    branch: prNumber === 1 ? "demo/violation" : "demo/decoy",
    startedAt: new Date().toISOString(),
    decision: null,
    steps,
    done: false,
  };
}

type DispatchEvent = PipelineEvent & { prNumber?: number; prTitle?: string };

// Map Render's event format → frontend PipelineEvent format
function normalizeRenderEvent(raw: Record<string, unknown>): DispatchEvent[] {
  const runId = (raw.jobId as string | undefined) ?? (raw.runId as string | undefined) ?? "";
  if (!runId) return [];
  const prNumber = (raw.pr as { number?: number } | undefined)?.number ?? 1;
  const prTitle  = (raw.pr as { title?: string }  | undefined)?.title;
  const status   = raw.status as string | undefined;
  const ev       = raw.event  as string | undefined;
  const base     = { runId, prNumber, prTitle };

  switch (ev) {
    case "job_accepted":
      return [{ ...base, type: "step", step: "trigger", status: "pass", message: "Webhook received — PR opened" }];

    case "sandbox_create":
      if (status === "starting") return [{ ...base, type: "step", step: "decide", status: "running", message: "Analyzing violation…" }];
      if (status === "ready")    return [
        { ...base, type: "step", step: "decide", status: "pass",    message: "HIGH confidence — card PAN in logs" },
        { ...base, type: "step", step: "fix",    status: "running", message: "Sandbox ready" },
      ];
      return [];

    case "clone":
      return status === "starting"
        ? [{ ...base, type: "step", step: "fix", status: "running", message: "Cloning repo…" }]
        : [];

    case "install":
      return status === "starting"
        ? [{ ...base, type: "step", step: "fix", status: "running", message: "Installing deps…" }]
        : [];

    case "inject":
      return [{ ...base, type: "step", step: "fix", status: "running", message: `Injecting violation at line ${raw.line}` }];

    case "attempt_start":
      return [{ ...base, type: "step", step: "fix", status: "running", message: `Attempt ${raw.attempt}/${raw.max} — asking Claude…` }];

    case "claude_call":
      if (status === "done") {
        const fix = raw.fix as string | undefined;
        return [{ ...base, type: "step", step: "fix", status: "running", message: "Claude wrote fix", detail: fix?.slice(0, 100) }];
      }
      return [];

    case "test":
      return status === "starting"
        ? [{ ...base, type: "step", step: "test", status: "running", message: "Running tests in sandbox…" }]
        : [];

    case "attempt_end": {
      const passed    = status === "passed";
      const fixDetail = (raw.fix_applied as string | undefined)?.slice(0, 100);
      if (passed) return [
        { ...base, type: "step", step: "test", status: "pass",    message: "All tests GREEN", detail: fixDetail },
        { ...base, type: "step", step: "fix",  status: "pass",    message: "Fix verified in sandbox" },
      ];
      return [
        { ...base, type: "step", step: "test",  status: "fail",    message: "Tests FAILED — self-correcting…" },
        { ...base, type: "step", step: "retry", status: "running", message: "Asking Claude again with failure context" },
      ];
    }

    case "done":
      if (status === "escalated") return [
        { ...base, type: "step",     step: "fix", status: "fail", message: (raw.reason as string) ?? "Max attempts reached" },
        { ...base, type: "decision", decision: "escalate" as Decision },
      ];
      return [];

    case "close_loop":
      if (status === "starting") return [{ ...base, type: "step", step: "merge", status: "running", message: "Merging fix via GitHub API…" }];
      if (status === "done") {
        const r      = raw.result as Record<string, unknown> | undefined;
        const merged = r?.merged as boolean | undefined;
        if (merged) return [
          { ...base, type: "step", step: "merge",   status: "pass", message: "Fix merged to main" },
          { ...base, type: "step", step: "receipt", status: "pass", message: "Receipt comment posted on PR" },
          { ...base, type: "step", step: "slack",   status: "pass", message: "Slack ping sent to #security-alerts" },
        ];
        return [{ ...base, type: "step", step: "merge", status: "fail", message: "Merge failed — escalating to human" }];
      }
      if (status === "error") return [{ ...base, type: "step", step: "merge", status: "fail", message: (raw.message as string) ?? "Close loop error" }];
      return [];

    case "job_complete":
      return [{ ...base, type: "done", message: "Pipeline complete" }];

    default:
      return [];
  }
}

function reducer(state: { runs: PRRun[] }, event: DispatchEvent): { runs: PRRun[] } {
  const { runs } = state;
  const idx = runs.findIndex((r) => r.id === event.runId);

  const run = idx === -1
    ? blankRun(event.runId, event.prNumber ?? 1, event.prTitle)
    : { ...runs[idx], steps: { ...runs[idx].steps } };

  if (event.type === "step" && event.step) {
    run.steps[event.step] = {
      status: event.status ?? "running",
      message: event.message ?? "",
      detail: event.detail,
      timestamp: new Date().toLocaleTimeString(),
    };
  } else if (event.type === "decision") {
    run.decision = event.decision ?? null;
  } else if (event.type === "done") {
    run.done = true;
  }

  if (idx === -1) {
    // Replace any existing run for the same prNumber — one card per PR
    const existing = runs.findIndex((r) => r.prNumber === (event.prNumber ?? 1));
    if (existing !== -1) {
      const next = [...runs];
      next[existing] = run;
      return { runs: next };
    }
    return { runs: [run, ...runs].slice(0, 5) };
  }
  const next = [...runs];
  next[idx] = run;
  return { runs: next };
}

export function usePipelineEvents() {
  const [state, dispatch] = useReducer(reducer, { runs: [] });
  const queueRef    = useRef<DispatchEvent[]>([]);
  const drainingRef = useRef(false);

  const drainNext = useCallback(() => {
    const ev = queueRef.current.shift();
    if (!ev) { drainingRef.current = false; return; }
    dispatch(ev);
    setTimeout(drainNext, 500);
  }, []);

  const enqueue = useCallback((ev: DispatchEvent) => {
    queueRef.current.push(ev);
    if (!drainingRef.current) {
      drainingRef.current = true;
      setTimeout(drainNext, 80);
    }
  }, [drainNext]);

  useEffect(() => {
    const es = new EventSource(ENDPOINTS.events);

    es.onmessage = (e) => {
      try {
        const raw = JSON.parse(e.data) as Record<string, unknown>;
        if (typeof raw.event === "string") {
          normalizeRenderEvent(raw).forEach(enqueue);
        } else if (typeof raw.type === "string") {
          enqueue(raw as unknown as DispatchEvent);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => es.close();
  }, [enqueue]);

  async function trigger(prNumber: number) {
    // Backup button — fires real Render backend with demo violation payload
    await fetch(ENDPOINTS.fix, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DEMO_VIOLATION),
    });
    // No runId from POST — SSE on /events will deliver job_accepted which creates the run
  }

  return { runs: state.runs, trigger };
}
