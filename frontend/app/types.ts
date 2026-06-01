export type StepStatus = "pending" | "running" | "pass" | "fail" | "skipped";

export type PipelineStep =
  | "trigger"
  | "decide"
  | "fix"
  | "test"
  | "retry"
  | "merge"
  | "receipt"
  | "slack";

export type Decision = "violation" | "allow" | "escalate" | null;

export interface StepState {
  status: StepStatus;
  message: string;
  detail?: string;
  timestamp?: string;
}

export interface PRRun {
  id: string;
  prNumber: number;
  prTitle: string;
  branch: string;
  startedAt: string;
  decision: Decision;
  steps: Record<PipelineStep, StepState>;
  done: boolean;
}

// Server-sent event payload
export interface PipelineEvent {
  type: "step" | "decision" | "done" | "error";
  runId: string;
  step?: PipelineStep;
  status?: StepStatus;
  message?: string;
  detail?: string;
  decision?: Decision;
}
