import { AuroraBackground } from "@/app/components/ui/aurora-background";
import { BreakdownView } from "@/app/components/BreakdownView";

export const metadata = {
  title: "Run Breakdown — PR Guardian",
};

export default function BreakdownPage() {
  return (
    <div className="relative min-h-screen">
      <AuroraBackground />
      <div className="relative z-20 min-h-screen">
        {/* Header — same as main page */}
        <header className="border-b border-violet-900/30 bg-gray-950/30 px-6 py-4 backdrop-blur-md sticky top-0 z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 shadow-[0_0_16px_rgba(124,58,237,0.6)]">
                <span className="text-xs font-black text-white">PG</span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
                Run breakdown
              </p>
            </div>
            <a
              href="/"
              className="font-mono text-[10px] uppercase tracking-widest text-gray-600 hover:text-violet-400 transition"
            >
              ← Live feed
            </a>
          </div>
        </header>

        <BreakdownView />
      </div>
    </div>
  );
}
