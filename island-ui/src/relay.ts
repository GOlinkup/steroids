// Browser WS relay client: persisted pairing, want-up backoff, status.
// Injectable socket/store/scheduler seams keep it testable under node.
// Erasable TS only (node --test strips types, no enums, no param props).
export type RelayStatus = "idle" | "connecting" | "connected" | "offline";

export interface RelayFrame {
  type: string;
  key: string;
  /** Idempotency token: sender-set, never routing. Absent on legacy frames. */
  id?: unknown;
  [k: string]: unknown;
}

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const K_ENDPOINT = "relay_endpoint";
const K_KEY = "relay_key";

export class RelayClient {
  private openSocket: (url: string) => SocketLike;
  private store: StorageLike;
  private schedule: (ms: number, fn: () => void) => unknown;
  private urlOf: () => string;
  private socket: SocketLike | null = null;
  private wantUp = false;
  private backoff = 1;
  private timer: unknown = null;
  private statusSubs = new Set<(s: RelayStatus) => void>();
  private msgSubs = new Set<(f: RelayFrame) => void>();
  // Receiver seen-set: production dedup (not test-local). Ids of delivered
  // frames, FIFO-capped so a long session can't grow it without bound.
  private seenIds: string[] = [];

  constructor(opts: {
    urlOf: () => string;
    openSocket?: (url: string) => SocketLike;
    store?: StorageLike;
    schedule?: (ms: number, fn: () => void) => unknown;
  }) {
    this.urlOf = opts.urlOf;
    this.openSocket =
      opts.openSocket ??
      ((url) => new WebSocket(url) as unknown as SocketLike);
    this.store =
      opts.store ??
      (globalThis.localStorage as unknown as StorageLike);
    this.schedule = opts.schedule ?? ((ms, fn) => setTimeout(fn, ms));
  }

  onStatus(fn: (s: RelayStatus) => void): () => void {
    this.statusSubs.add(fn);
    return () => this.statusSubs.delete(fn);
  }

  onMessage(fn: (f: RelayFrame) => void): () => void {
    this.msgSubs.add(fn);
    return () => this.msgSubs.delete(fn);
  }

  private emit(s: RelayStatus): void {
    for (const fn of this.statusSubs) fn(s);
  }

  /** Pair once: endpoint + key persist. Reconnects never re-pair. */
  pair(endpoint: string, key: string): void {
    this.store.setItem(K_ENDPOINT, endpoint);
    this.store.setItem(K_KEY, key);
  }

  get endpoint(): string | null {
    return this.store.getItem(K_ENDPOINT);
  }

  connect(): void {
    this.wantUp = true;
    this.open();
  }

  disconnect(): void {
    this.wantUp = false;
    if (this.timer !== null) {
      clearTimeout(this.timer as ReturnType<typeof setTimeout>);
      this.timer = null;
    }
    try {
      this.socket?.close();
    } catch {
      /* already gone */
    }
    this.socket = null;
    this.emit("idle");
  }

  /** Send a frame. False = offline (caller queues to outbox, never drops).
   * `key` is always the routing/pairing key (payload `key` never survives);
   * a caller `id` passes through untouched for far-end dedup. */
  send(type: string, payload: Record<string, unknown> = {}): boolean {
    const s = this.socket;
    if (!s) return false;
    try {
      const key = this.store.getItem(K_KEY) ?? "";
      s.send(JSON.stringify({ ...payload, type, key }));
      return true;
    } catch {
      return false;
    }
  }

  private open(): void {
    if (!this.wantUp || this.socket) return;
    const ep = this.endpoint;
    if (!ep) {
      this.emit("idle");
      return;
    }
    this.emit("connecting");
    let s: SocketLike;
    try {
      s = this.openSocket(this.urlOf() + "?key=" + this.store.getItem(K_KEY));
    } catch {
      this.retry();
      return;
    }
    s.onopen = () => {
      if (!this.wantUp) {
        try {
          s.close();
        } catch {
          /* ignore */
        }
        return;
      }
      this.socket = s;
      this.backoff = 1;
      this.emit("connected");
    };
    const dropped = () => {
      if (s === this.socket) this.socket = null;
      if (!this.wantUp) return;
      this.emit("offline");
      this.retry();
    };
    s.onclose = dropped;
    s.onerror = dropped;
    s.onmessage = (e) => {
      try {
        const f = JSON.parse(e.data) as RelayFrame;
        if (f && typeof f.type === "string") {
          if (typeof f.id === "string" && f.id) {
            if (this.seenIds.includes(f.id)) return; // redelivery: drop
            this.seenIds.push(f.id);
            if (this.seenIds.length > 500) this.seenIds.shift();
          }
          for (const fn of this.msgSubs) fn(f);
        }
      } catch {
        /* malformed rows drop */
      }
    };
  }

  private retry(): void {
    if (!this.wantUp || this.timer !== null) return;
    const wait = this.backoff;
    this.backoff = Math.min(30, Math.max(1, this.backoff * 2));
    this.timer = this.schedule(wait * 1000, () => {
      this.timer = null;
      this.open();
    });
  }
}
