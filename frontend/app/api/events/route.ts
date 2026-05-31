import { subscribe } from "./bus";

export const dynamic = "force-dynamic";

const RENDER_EVENTS = "https://pr-guardian-fix-engine.onrender.com/events";

export async function GET() {
  let unsub: (() => void) | null = null;
  let renderAbort: AbortController | null = null;
  let hbTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();

      const fwd = (raw: string) => {
        try { controller.enqueue(enc.encode(`data: ${raw}\n\n`)); } catch {}
      };

      // Local bus — simulated pipeline backup buttons
      unsub = subscribe(controller);

      // Heartbeat so proxies don't close the stream
      hbTimer = setInterval(() => {
        try { controller.enqueue(enc.encode(": heartbeat\n\n")); } catch { clearInterval(hbTimer!); }
      }, 15_000);

      // Render SSE proxy — server-side fetch avoids browser CORS entirely
      renderAbort = new AbortController();
      (async () => {
        try {
          const res = await fetch(RENDER_EVENTS, {
            signal: renderAbort!.signal,
            headers: { Accept: "text/event-stream" },
          });
          if (!res.body) return;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data:")) fwd(line.slice(5).trim());
            }
          }
        } catch (err: unknown) {
          const name = (err as { name?: string }).name;
          if (name !== "AbortError") {
            console.warn("[events-proxy] Render SSE disconnected:", (err as Error).message);
          }
        }
      })();
    },

    cancel() {
      unsub?.();
      renderAbort?.abort();
      if (hbTimer) clearInterval(hbTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
