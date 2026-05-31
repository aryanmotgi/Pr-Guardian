"use client";
import { useEffect, useReducer, useRef } from "react";
import type { PipelineEvent, PRRun, PipelineStep, StepState } from "@/app/types";

const BACKEND = "https://pr-guardian-fix-engine.onrender.com";
export const ENDPOINTS = {
  events: `${BACKEND}/events`,
  fix:    `${BACKEND}/fix`,
  health: `${BACKEND}/health`,
} as const;

const STEPS: PipelineStep[] = ["trigger", "decide", "fix", "test", "retry", "merge", "receipt", "slack"];

function blankRun(runId: string, prNumber: number): PRRun {
  const steps = Object.fromEntries(
    STEPS.map((s) => [s, { status: "pending", message: "" } satisfies StepState])
  ) as Record<PipelineStep, StepState>;
  return {
    id: runId,
    prNumber,
    prTitle: prNumber === 1 ? "feat: add payment logging (REAL violation)" : "test: use standard Stripe test card (decoy)",
    branch: prNumber === 1 ? "feat/payment-logging" : "test/stripe-card",
    startedAt: new Date().toISOString(),
    decision: null,
    steps,
    done: false,
  };
}

type State = { runs: PRRun[] };

function reducer(state: State, event: PipelineEvent & { prNumber?: number }): State {
  const { runs } = state;
  const idx = runs.findIndex((r) => r.id === event.runId);

  if (idx === -1) {
    // New run
    const run = blankRun(event.runId, event.prNumber ?? 1);
    return { runs: [run, ...runs].slice(0, 10) };
  }

  const run = { ...runs[idx], steps: { ...runs[idx].steps } };

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

  const next = [...runs];
  next[idx] = run;
  return { runs: next };
}

export function usePipelineEvents() {
  const [state, dispatch] = useReducer(reducer, { runs: [] });
  const pendingRunMeta = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const es = new EventSource(ENDPOINTS.events);
    es.onmessage = (e) => {
      const event: PipelineEvent = JSON.parse(e.data);
      const prNumber = pendingRunMeta.current.get(event.runId) ?? 1;
      dispatch({ ...event, prNumber });
    };
    return () => es.close();
  }, []);

  async function trigger(prNumber: number) {
    const res = await fetch(ENDPOINTS.fix, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prNumber }),
    });
    const { runId } = await res.json();
    pendingRunMeta.current.set(runId, prNumber);
    dispatch({ type: "step", runId, prNumber, step: "trigger", status: "running", message: "Starting…" });
  }

  return { runs: state.runs, trigger };
}
