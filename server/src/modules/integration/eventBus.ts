// E2.15b: In-process pub/sub event bus.
// Publishing an event automatically triggers webhook delivery for all active subscriptions.
// Handler errors are caught per-handler so a bad handler cannot crash the bus.

import type { EventBusHandler } from '@wings2i-gracie/contracts';

class EventBus {
  private readonly handlers = new Map<string, Set<EventBusHandler>>();

  subscribe(eventKey: string, handler: EventBusHandler): void {
    if (!this.handlers.has(eventKey)) {
      this.handlers.set(eventKey, new Set());
    }
    this.handlers.get(eventKey)!.add(handler);
  }

  unsubscribe(eventKey: string, handler: EventBusHandler): void {
    this.handlers.get(eventKey)?.delete(handler);
  }

  async publish(eventKey: string, payload: unknown): Promise<void> {
    const set = this.handlers.get(eventKey);
    if (!set || set.size === 0) return;

    const promises = Array.from(set).map((handler) =>
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => {
          console.warn(`[core/eventBus] Handler error for "${eventKey}":`, err);
        }),
    );

    await Promise.all(promises);
  }
}

export const eventBus = new EventBus();
