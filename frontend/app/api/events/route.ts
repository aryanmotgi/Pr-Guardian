import { subscribe } from "./bus";

export const dynamic = "force-dynamic";

export async function GET() {
  let unsub: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      unsub = subscribe(controller);
      // heartbeat every 15s to keep the connection alive through proxies
      const hb = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        } catch {
          clearInterval(hb);
        }
      }, 15_000);
    },
    cancel() {
      unsub?.();
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
