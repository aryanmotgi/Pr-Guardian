"use client";

import { useState } from "react";
import { GlassButton } from "@/app/components/ui/glass-button";
import { BlurFade } from "@/app/components/ui/blur-fade";

export function TriggerPanel({ onTrigger }: { onTrigger: (prNumber: number) => void }) {
  const [loading, setLoading] = useState<number | null>(null);

  async function fire(prNumber: number) {
    setLoading(prNumber);
    await onTrigger(prNumber);
    setTimeout(() => setLoading(null), 500);
  }

  return (
    <BlurFade delay={0.1}>
      <div className="rounded-xl border border-violet-900/30 bg-gray-950/60 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-violet-400 text-sm">⚡</span>
          <h3 className="text-white font-semibold text-sm">Manual trigger</h3>
          <span className="ml-auto text-gray-600 text-xs">backup if webhook hiccups</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <GlassButton
            variant="violation"
            disabled={loading !== null}
            onClick={() => fire(1)}
          >
            {loading === 1 ? "Running…" : "PR #1 — Real violation"}
          </GlassButton>
          <GlassButton
            variant="allow"
            disabled={loading !== null}
            onClick={() => fire(2)}
          >
            {loading === 2 ? "Running…" : "PR #2 — Decoy (allow)"}
          </GlassButton>
        </div>
      </div>
    </BlurFade>
  );
}
