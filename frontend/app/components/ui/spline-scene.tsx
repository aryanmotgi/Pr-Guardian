"use client";

// Lazy Spline wrapper — code-splits the heavy 3D runtime out of first paint.
// Uses the base client component (not the /next async one) so the parent can
// pass onLoad and keep the canvas interactive (the robot tracks the cursor).
// Source pattern: serafim/splite (https://21st.dev/community/components/serafim/splite/default)
import { Suspense, lazy } from "react";
import type { Application } from "@splinetool/runtime";
import { OrbitalLoader } from "./orbital-loader";

const Spline = lazy(() => import("@splinetool/react-spline"));

export function SplineScene({
  scene,
  className,
  onLoad,
}: {
  scene: string;
  className?: string;
  onLoad?: (app: Application) => void;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <OrbitalLoader size={40} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-violet-300/60">
              waking the guardian…
            </span>
          </div>
        </div>
      }
    >
      <Spline scene={scene} className={className} onLoad={onLoad} />
    </Suspense>
  );
}
