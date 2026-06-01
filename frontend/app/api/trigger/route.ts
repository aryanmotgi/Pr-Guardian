import { NextRequest, NextResponse } from "next/server";
import { publish } from "../events/bus";
import type { PipelineStep, StepStatus } from "@/app/types";

// Simulates the full pipeline so the demo works without a live webhook.
// ASSUMPTION: Replace the step sequence with real calls to Shreyash/Aryan/Kaushik's
// endpoints once they're wired up. Each step should call publish() with real status.
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runSimulatedPipeline(runId: string, prNumber: number) {
  const steps: Array<{
    step: PipelineStep;
    status: StepStatus;
    message: string;
    detail?: string;
    delay: number;
  }> = prNumber === 1
    ? [
        { step: "trigger",  status: "pass",    message: "Webhook received — PR #1 opened",              delay: 600  },
        { step: "decide",   status: "pass",    message: "HIGH confidence violation — card PAN in logs", detail: "payment.js:14 logs full card number",  delay: 1200 },
        { step: "fix",      status: "pass",    message: "Sandbox spun up — rewriting payment.js",       delay: 1500 },
        { step: "test",     status: "fail",    message: "Tests FAILED — mask regex too greedy",         detail: "checkout.test.js: AssertionError",       delay: 1200 },
        { step: "retry",    status: "pass",    message: "Self-correcting — second rewrite attempt",     delay: 1400 },
        { step: "test",     status: "pass",    message: "All tests GREEN",                              delay: 1000 },
        { step: "merge",    status: "pass",    message: "Fix merged via GitHub API",                    delay: 800  },
        { step: "receipt",  status: "pass",    message: "Receipt comment posted on PR",                 delay: 600  },
        { step: "slack",    status: "pass",    message: "Slack ping sent — #security-alerts",           delay: 500  },
      ]
    : [
        { step: "trigger",  status: "pass",    message: "Webhook received — PR #2 opened",              delay: 600  },
        { step: "decide",   status: "pass",    message: "ALLOW — test data in test file (4242…)",       detail: "checkout.test.js: well-known fake card, not production code", delay: 1400 },
        { step: "slack",    status: "pass",    message: "Allowed — reason logged to audit trail",       delay: 600  },
      ];

  for (const s of steps) {
    await sleep(s.delay);
    publish({
      type: "step",
      runId,
      step: s.step,
      status: s.status,
      message: s.message,
      detail: s.detail,
    });
  }

  const decision = prNumber === 1 ? "violation" : "allow";
  publish({ type: "decision", runId, decision });
  publish({ type: "done", runId, message: `PR #${prNumber} run complete` });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prNumber: number = body.prNumber ?? 1;
  const runId = `run-${Date.now()}`;

  // Fire and forget — client listens via SSE
  runSimulatedPipeline(runId, prNumber);

  return NextResponse.json({ runId });
}
