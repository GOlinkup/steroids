// Relay client proofs: persisted pairing, reconnect, offline-send.
// Fake socket + manual scheduler under node --test (no deps, no DOM).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RelayClient } from "../src/relay.ts";
import type { SocketLike, StorageLike } from "../src/relay.ts";

function memStore(seed = new Map<string, string>()): StorageLike {
  return {
    getItem: (k) => seed.get(k) ?? null,
    setItem: (k, v) => void seed.set(k, v),
    removeItem: (k) => void seed.delete(k),
  };
}

class FakeSocket implements SocketLike {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(d: string): void {
    this.sent.push(d);
  }
  close(): void {
    this.closed = true;
  }
}

describe("relay client", () => {
  it("pair persists; echo round-trip; reconnect without re-pair", () => {
    const backing = new Map<string, string>();
    const schedules: Array<() => void> = [];
    const sockets: FakeSocket[] = [];
    const statuses: string[] = [];
    const client = new RelayClient({
      urlOf: () => "ws://x/relay/ws",
      openSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      store: memStore(backing),
      schedule: (_ms, fn) => {
        schedules.push(fn);
        return schedules.length;
      },
    });
    client.onStatus((s) => void statuses.push(s));
    client.pair("ws://x/relay/ws", "K1");
    client.connect();
    assert.deepEqual(statuses, ["connecting"]);
    sockets[0].onopen?.({});
    assert.deepEqual(statuses, ["connecting", "connected"]);
    assert.ok(client.send("reply", { text: "hi" }));
    const frame = JSON.parse(sockets[0].sent[0]) as Record<string, unknown>;
    assert.equal(frame.key, "K1"); // key injected per frame
    sockets[0].onclose?.({}); // network switch kills the socket
    assert.equal(statuses.at(-1), "offline");
    assert.equal(schedules.length, 1); // exactly one retry armed
    schedules.pop()!(); // timer fires: reconnect, same pairing
    assert.equal(sockets.length, 2);
    sockets[1].onopen?.({});
    assert.equal(statuses.at(-1), "connected");
    assert.equal(backing.get("relay_key"), "K1"); // never re-paired
    client.disconnect();
    assert.equal(statuses.at(-1), "idle");
  });

  it("send while offline returns false; malformed rows drop", () => {
    const got: unknown[] = [];
    const client = new RelayClient({
      urlOf: () => "ws://x/relay/ws",
      store: memStore(),
    });
    client.onMessage((f) => void got.push(f));
    assert.equal(client.send("reply"), false); // caller queues, never drops
  });

  it("receiver seen-set: same id delivers once, legacy no-id passes", () => {
    const sockets: FakeSocket[] = [];
    const client = new RelayClient({
      urlOf: () => "ws://x/relay/ws",
      openSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      store: memStore(),
    });
    const got: string[] = [];
    client.onMessage((f) => void got.push(`${String(f.id ?? "-")}:${String(f.type)}`));
    client.pair("ws://x/relay/ws", "K1");
    client.connect();
    sockets[0].onopen?.({});
    const emit = (obj: unknown) => sockets[0].onmessage?.({ data: JSON.stringify(obj) });
    emit({ type: "chat", key: "K1", id: "A", text: "hi" });
    emit({ type: "chat", key: "K1", id: "A", text: "hi" }); // hub redelivery
    emit({ type: "chat", key: "K1", id: "B", text: "yo" });
    emit({ type: "chat", key: "K1", text: "legacy" }); // pre-split: no token
    emit({ type: "chat", key: "K1", text: "legacy" });
    assert.deepEqual(got, ["A:chat", "B:chat", "-:chat", "-:chat"]);
    // sender keeps routing key while preserving the token
    assert.ok(client.send("reply", { id: "C" }));
    const frame = JSON.parse(sockets[0].sent[0]) as Record<string, unknown>;
    assert.equal(frame.key, "K1");
    assert.equal(frame.id, "C");
  });
});
