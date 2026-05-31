// In-process pub/sub for SSE. One controller per connected client.
// ASSUMPTION: single server instance (fine for hackathon / Render single dyno).
import type { PipelineEvent } from "@/app/types";

type Controller = ReadableStreamDefaultController<Uint8Array>;

const clients = new Set<Controller>();

export function subscribe(controller: Controller) {
  clients.add(controller);
  return () => clients.delete(controller);
}

export function publish(event: PipelineEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = new TextEncoder().encode(data);
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(encoded);
    } catch {
      clients.delete(ctrl);
    }
  }
}
