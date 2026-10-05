// Offline outbox: durable FIFO queue, fire-on-reconnect, exactly-once.
// Idempotency key (crypto.randomUUID, no deps) rides inside every frame;
// the far end dedups, so a flaky retry can never double-deliver.
// Erasable TS only (node --test strips types).
import type { StorageLike } from "./relay";

export interface OutboxItem {
  key: string;
  type: string;
  payload: Record<string, unknown>;
  enqueuedAt: string;
}

const K_OUTBOX = "island_outbox_v1";

export class OutboxStore {
  private store: StorageLike;
  private newKey: () => string;

  constructor(store?: StorageLike, newKey?: () => string) {
    this.store =
      store ?? (globalThis.localStorage as unknown as StorageLike);
    this.newKey =
      newKey ??
      (() =>
        globalThis.crypto?.randomUUID?.() ??
        Math.random().toString(36).slice(2) + Date.now().toString(36));
  }

  /** Queue an item, returns its idempotency key. */
  enqueue(type: string, payload: Record<string, unknown>): string {
    const items = this.read();
    const item: OutboxItem = {
      key: this.newKey(),
      type,
      payload,
      enqueuedAt: new Date().toISOString(),
    };
    items.push(item);
    this.write(items);
    return item.key;
  }

  pending(): OutboxItem[] {
    return this.read();
  }

  /** Cancel before it fires. True = it was still queued. */
  cancel(key: string): boolean {
    const items = this.read();
    const kept = items.filter((i) => i.key !== key);
    if (kept.length === items.length) return false;
    this.write(kept);
    return true;
  }

  /**
   * Fire in order via send. An item leaves only after the transport
   * confirms it — a flaky reconnect retries with the same key.
   */
  async flush(
    send: (frame: Record<string, unknown>) => Promise<boolean>,
  ): Promise<number> {
    let items = this.read();
    let fired = 0;
    while (items.length > 0) {
      const head = items[0];
      const ok = await send({ ...head.payload, type: head.type, key: head.key });
      if (!ok) break; // still offline: head stays, order preserved
      items = items.slice(1);
      this.write(items);
      fired++;
    }
    return fired;
  }

  /** Fire-on-reconnect: flush through send on every connect. */
  flushOnReconnect(
    onStatus: (fn: (s: string) => void) => () => void,
    send: (frame: Record<string, unknown>) => Promise<boolean>,
  ): () => void {
    return onStatus((s) => {
      if (s === "connected") void this.flush(send);
    });
  }

  private read(): OutboxItem[] {
    let raw: string | null = null;
    try {
      raw = this.store.getItem(K_OUTBOX);
    } catch {
      return [];
    }
    if (!raw) return [];
    try {
      const decoded: unknown = JSON.parse(raw);
      if (!Array.isArray(decoded)) return [];
      return (decoded as OutboxItem[]).filter(
        (i) =>
          i && typeof i.key === "string" && typeof i.type === "string",
      );
    } catch {
      return [];
    }
  }

  private write(items: OutboxItem[]): void {
    this.store.setItem(K_OUTBOX, JSON.stringify(items));
  }
}
